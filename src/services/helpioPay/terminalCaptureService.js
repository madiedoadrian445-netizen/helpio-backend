// src/services/helpioPay/terminalCaptureService.js
import {
  stripeClient,
  isLiveStripe,
  isSimulatedStripe,
} from "../../config/stripe.js";
import mongoose from "mongoose";

import Invoice from "../../models/Invoice.js";
import Subscription from "../../models/Subscription.js";
import { CustomerTimeline } from "../../models/CustomerTimeline.js";

import {
  reserveIdempotencyKey,
  markIdempotencyKeyCompleted,
  markIdempotencyKeyFailed,
} from "../../utils/idempotency.js";

import {
  recordInvoicePaymentLedger,
  recordSubscriptionChargeLedger,
} from "../../utils/ledger.js";

import {
  getSimulatedIntentById,
  markSimulatedIntentCaptured,
  hasSimulatedIntent,
} from "./terminalSimService.js";

import { computeTerminalFeesForGrossCents } from "./terminalFeeService.js";

const safeNum = (n) => {
  const v = parseFloat(n);
  return Number.isNaN(v) ? 0 : v;
};

const sendErrorLike = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

/* --------------------------------------------------
   DATE HELPER (subscriptions)
-------------------------------------------------- */
const computeNextBillingDate = (fromDate, unit = "monthly") => {
  const base = fromDate ? new Date(fromDate) : new Date();
  const d = new Date(base);

  switch (unit) {
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "biweekly":
      d.setDate(d.getDate() + 14);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      break;
    case "monthly":
    default:
      d.setMonth(d.getMonth() + 1);
      break;
  }

  return d;
};

/* --------------------------------------------------
   CAPTURE TERMINAL PAYMENT
-------------------------------------------------- */

export const captureTerminalPaymentService = async ({
  paymentIntentId,
  idempotencyKey,
}) => {
  if (!paymentIntentId)
    throw sendErrorLike("paymentIntentId is required.", 400);
  if (!idempotencyKey)
    throw sendErrorLike("idempotencyKey is required.", 400);

  let idem;
  try {
    idem = await reserveIdempotencyKey({
      key: idempotencyKey,
      type: "terminal_charge_capture",
      initiatedBy: "helpio_terminal",
      payloadForHash: { paymentIntentId },
      extraContext: { route: "captureTerminalPayment" },
    });
  } catch (err) {
    throw sendErrorLike(err.message || "Idempotency error", 400);
  }

  if (idem.status === "existing_completed") {
    const piId = idem.record.stripePaymentIntentId;

    if (isLiveStripe && stripeClient && !isSimulatedStripe && piId) {
      const pi =
        (await stripeClient.paymentIntents.retrieve(piId).catch(() => null)) ||
        null;
      if (pi) {
        return {
          mode: "live",
          idempotencyReplayed: true,
          paymentIntent: {
            id: pi.id,
            status: pi.status,
            amount: pi.amount,
            currency: pi.currency,
          },
        };
      }
    }

    if (hasSimulatedIntent(piId)) {
      return {
        mode: "simulated",
        idempotencyReplayed: true,
        paymentIntent: getSimulatedIntentById(piId),
      };
    }

    return {
      idempotencyReplayed: true,
      paymentIntentId: piId,
    };
  }

  if (idem.status === "existing_in_progress") {
    throw sendErrorLike("Capture already in progress.", 409);
  }

  if (idem.status === "existing_failed") {
    throw sendErrorLike("Previous capture failed, use a new key.", 409);
  }

  const idemId = idem.record._id;

  /* --------------------------------------------------
     LIVE CAPTURE
  -------------------------------------------------- */
  if (isLiveStripe && stripeClient && !isSimulatedStripe) {
    try {
      const pi = await stripeClient.paymentIntents.capture(
        paymentIntentId,
        {},
        { idempotencyKey }
      );

      const grossCents = pi.amount || 0;
      const { stripeFeeCents, helpioFeeCents, totalFeeCents, netCents } =
        computeTerminalFeesForGrossCents(grossCents);

      const invoiceId = pi.metadata?.invoiceId || null;
      const subscriptionId = pi.metadata?.subscriptionId || null;

      let invoiceDoc = null;
      let subscriptionDoc = null;
      let invoiceLedgerResult = null;
      let subscriptionLedgerResult = null;
      let providerBalance = null;

      /* ---------- INVOICE FLOW ---------- */
      if (invoiceId) {
        invoiceDoc = await Invoice.findById(invoiceId).catch(() => null);
        if (invoiceDoc) {
          // Mark as paid (you already handle fine-grained balances via invoice payment flows)
          invoiceDoc.status = "paid";
          await invoiceDoc.save().catch(() => {});
        }

        const providerId =
          pi.metadata?.providerId || invoiceDoc?.provider || null;
        const customerId =
          pi.metadata?.customerId ||
          invoiceDoc?.client ||
          invoiceDoc?.customer ||
          null;

        if (providerId) {
          try {
            invoiceLedgerResult = await recordInvoicePaymentLedger({
              providerId,
              customerId,
              invoiceId,
              invoiceNumber:
                invoiceDoc?.invoiceNumber || invoiceDoc?.number || null,
              stripePaymentIntentId: pi.id,
              stripeChargeId: pi.latest_charge || null,
              grossAmountCents: grossCents,
              feeAmountCents: totalFeeCents,
              netAmountCents: netCents,
              settlementDays: 7,
              trigger: "helpio_terminal",
              metadata: {
                brand: "Helpio Pay",
                terminal: true,
                stripeFeeCents,
                helpioFeeCents,
                totalFeeCents,
                netCents,
              },
            });
            providerBalance =
              invoiceLedgerResult?.balance || providerBalance || null;
          } catch (e) {
            console.error("❌ Invoice ledger error (terminal):", e.message);
          }
        }
      }

      /* ---------- SUBSCRIPTION FLOW ---------- */
      if (subscriptionId) {
        subscriptionDoc = await Subscription.findById(subscriptionId)
          .populate("plan")
          .populate("client")
          .catch(() => null);

        if (subscriptionDoc) {
          const plan = subscriptionDoc.plan;

          subscriptionDoc.status = "active";
          subscriptionDoc.cycleCount =
            (subscriptionDoc.cycleCount || 0) + 1;

          const freq = plan?.billingFrequency || "monthly";
          const baseDate =
            subscriptionDoc.nextBillingDate || new Date();
          subscriptionDoc.nextBillingDate = computeNextBillingDate(
            baseDate,
            freq
          );
          subscriptionDoc.lastChargeStatus = "success";
          subscriptionDoc.lastBilledAt = new Date();

          await subscriptionDoc.save().catch(() => {});

          // CRM Timeline
          if (subscriptionDoc.client) {
            const chargeAmount = safeNum(
              subscriptionDoc.price || plan?.price || grossCents / 100
            );
            try {
              await CustomerTimeline.create({
                provider: subscriptionDoc.provider,
                customer:
                  subscriptionDoc.client._id || subscriptionDoc.client,
                type: "subscription_charge",
                title:
                  "Subscription charge succeeded (Helpio Pay Terminal)",
                description: `Charged $${chargeAmount.toFixed(
                  2
                )} for subscription (Tap to Pay)`,
                amount: chargeAmount,
                subscription: subscriptionDoc._id,
              });
            } catch (e) {
              console.error(
                "❌ CustomerTimeline error (terminal subscription):",
                e.message
              );
            }
          }
        }

        const providerId =
          pi.metadata?.providerId || subscriptionDoc?.provider || null;
        const customerId =
          pi.metadata?.customerId ||
          subscriptionDoc?.client ||
          subscriptionDoc?.customer ||
          null;
        const planId =
          pi.metadata?.planId || subscriptionDoc?.plan || null;

        if (providerId) {
          try {
            subscriptionLedgerResult = await recordSubscriptionChargeLedger({
              providerId,
              customerId,
              subscriptionId,
              planId,
              stripePaymentIntentId: pi.id,
              grossAmountCents: grossCents,
              feeAmountCents: totalFeeCents,
              netAmountCents: netCents,
              settlementDays: 7,
              trigger: "helpio_terminal",
              metadata: {
                brand: "Helpio Pay",
                terminal: true,
                stripeFeeCents,
                helpioFeeCents,
                totalFeeCents,
                netCents,
              },
            });
            providerBalance =
              subscriptionLedgerResult?.balance || providerBalance || null;
          } catch (e) {
            console.error(
              "❌ Subscription ledger error (terminal):",
              e.message
            );
          }
        }
      }

      await markIdempotencyKeyCompleted(idemId, {
        stripePaymentIntentId: pi.id,
        extraContext: { status: pi.status },
      });

      return {
        mode: "live",
        paymentIntent: {
          id: pi.id,
          status: pi.status,
          amount: pi.amount,
          currency: pi.currency,
        },
        invoice: invoiceDoc,
        subscription: subscriptionDoc,
        invoiceLedgerEntry: invoiceLedgerResult?.entry || null,
        subscriptionLedgerEntry: subscriptionLedgerResult?.entry || null,
        providerBalance,
        fees: {
          stripeFeeCents,
          helpioFeeCents,
          totalFeeCents,
          netCents,
        },
      };
    } catch (err) {
      await markIdempotencyKeyFailed(idemId, {
        extraContext: err.message,
      });
      throw sendErrorLike(
        "Helpio Pay Terminal Error: Unable to capture payment.",
        500
      );
    }
  }

  /* --------------------------------------------------
     SIMULATED CAPTURE
  -------------------------------------------------- */
  const intent = markSimulatedIntentCaptured(paymentIntentId);
  if (!intent) {
    await markIdempotencyKeyFailed(idemId, {
      extraContext: { error: "Simulated PI not found" },
    });
    throw sendErrorLike("PaymentIntent not found.", 404);
  }

  const grossCents = intent.amount || 0;
  const { stripeFeeCents, helpioFeeCents, totalFeeCents, netCents } =
    computeTerminalFeesForGrossCents(grossCents);

  const invoiceId = intent.invoiceId || null;
  const subscriptionId = intent.subscriptionId || null;

  let invoiceDoc = null;
  let subscriptionDoc = null;
  let invoiceLedgerResult = null;
  let subscriptionLedgerResult = null;
  let providerBalance = null;

  /* ---------- INVOICE (SIM) ---------- */
  if (invoiceId) {
    invoiceDoc = await Invoice.findById(invoiceId).catch(() => null);
    if (invoiceDoc) {
      invoiceDoc.status = "paid";
      await invoiceDoc.save().catch(() => {});
    }

    const providerId = invoiceDoc?.provider || null;
    const customerId =
      invoiceDoc?.client || invoiceDoc?.customer || null;

    if (providerId) {
      try {
        invoiceLedgerResult = await recordInvoicePaymentLedger({
          providerId,
          customerId,
          invoiceId,
          invoiceNumber:
            invoiceDoc?.invoiceNumber || invoiceDoc?.number || null,
          stripePaymentIntentId: intent.id,
          stripeChargeId: null,
          grossAmountCents: grossCents,
          feeAmountCents: totalFeeCents,
          netAmountCents: netCents,
          settlementDays: 7,
          trigger: "helpio_terminal",
          metadata: {
            simulated: true,
            brand: "Helpio Pay",
            terminal: true,
            stripeFeeCents,
            helpioFeeCents,
            totalFeeCents,
            netCents,
          },
        });
        providerBalance =
          invoiceLedgerResult?.balance || providerBalance || null;
      } catch (e) {
        console.error("❌ Sim invoice ledger error:", e.message);
      }
    }
  }

  /* ---------- SUBSCRIPTION (SIM) ---------- */
  if (subscriptionId) {
    subscriptionDoc = await Subscription.findById(subscriptionId)
      .populate("plan")
      .populate("client")
      .catch(() => null);

    if (subscriptionDoc) {
      const plan = subscriptionDoc.plan;

      subscriptionDoc.status = "active";
      subscriptionDoc.cycleCount =
        (subscriptionDoc.cycleCount || 0) + 1;

      const freq = plan?.billingFrequency || "monthly";
      const baseDate =
        subscriptionDoc.nextBillingDate || new Date();
      subscriptionDoc.nextBillingDate = computeNextBillingDate(
        baseDate,
        freq
      );
      subscriptionDoc.lastChargeStatus = "success";
      subscriptionDoc.lastBilledAt = new Date();

      await subscriptionDoc.save().catch(() => {});

      if (subscriptionDoc.client) {
        const chargeAmount = safeNum(
          subscriptionDoc.price || plan?.price || grossCents / 100
        );
        try {
          await CustomerTimeline.create({
            provider: subscriptionDoc.provider,
            customer:
              subscriptionDoc.client._id || subscriptionDoc.client,
            type: "subscription_charge",
            title:
              "Subscription charge succeeded (Helpio Pay Terminal)",
            description: `Charged $${chargeAmount.toFixed(
              2
            )} for subscription (Tap to Pay)`,
            amount: chargeAmount,
            subscription: subscriptionDoc._id,
          });
        } catch (e) {
          console.error(
            "❌ CustomerTimeline error (sim terminal subscription):",
            e.message
          );
        }
      }
    }

    const providerId = subscriptionDoc?.provider || null;
    const customerId =
      subscriptionDoc?.client || subscriptionDoc?.customer || null;
    const planId = subscriptionDoc?.plan || null;

    if (providerId) {
      try {
        subscriptionLedgerResult = await recordSubscriptionChargeLedger({
          providerId,
          customerId,
          subscriptionId,
          planId,
          stripePaymentIntentId: intent.id,
          grossAmountCents: grossCents,
          feeAmountCents: totalFeeCents,
          netAmountCents: netCents,
          settlementDays: 7,
          trigger: "helpio_terminal",
          metadata: {
            simulated: true,
            brand: "Helpio Pay",
            terminal: true,
            stripeFeeCents,
            helpioFeeCents,
            totalFeeCents,
            netCents,
          },
        });
        providerBalance =
          subscriptionLedgerResult?.balance || providerBalance || null;
      } catch (e) {
        console.error(
          "❌ Sim subscription ledger error:",
          e.message
        );
      }
    }
  }

  await markIdempotencyKeyCompleted(idemId, {
    stripePaymentIntentId: intent.id,
    extraContext: { simulated: true, status: intent.status },
  });

  return {
    mode: "simulated",
    paymentIntent: intent,
    invoice: invoiceDoc,
    subscription: subscriptionDoc,
    invoiceLedgerEntry: invoiceLedgerResult?.entry || null,
    subscriptionLedgerEntry: subscriptionLedgerResult?.entry || null,
    providerBalance,
    fees: {
      stripeFeeCents,
      helpioFeeCents,
      totalFeeCents,
      netCents,
    },
  };
};
