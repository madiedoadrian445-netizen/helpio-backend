// src/controllers/refundController.js
import mongoose from "mongoose";
import Invoice from "../models/Invoice.js";
import Subscription from "../models/Subscription.js";
import Provider from "../models/Provider.js";


import {
  stripeClient,
  isLiveStripe,
  isSimulatedStripe,
} from "../config/stripe.js";

import {
  reserveIdempotencyKey,
  markIdempotencyKeyCompleted,
  markIdempotencyKeyFailed,
} from "../utils/idempotency.js";

import {
  recordInvoicePaymentLedger,
  recordSubscriptionChargeLedger,
} from "../utils/ledger.js";

/* -------------------------------------------------------
   HELPERS
-------------------------------------------------------- */

const safeNum = (n) => {
  const v = parseFloat(n);
  return Number.isNaN(v) ? 0 : v;
};

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

const getProviderForUser = async (userId) => {
  if (!userId) return null;
  return Provider.findOne({ user: userId });
};

const normalizeCurrency = (currency) =>
  !currency || typeof currency !== "string" ? "usd" : currency.toLowerCase();

/**
 * Same fee model we use elsewhere:
 *  - Network fees: 2.9% + 30¢
 *  - Helpio Pay fee: 1%
 *
 * Here it's used so that the ledger refund
 * properly reverses the provider's net amount.
 */
const computeFeesForGrossCents = (grossCents) => {
  const stripeFeeCents = Math.round(grossCents * 0.029 + 30);
  const helpioFeeCents = Math.round(grossCents * 0.01);
  const totalFeeCents = stripeFeeCents + helpioFeeCents;
  const netCents = Math.max(0, grossCents - totalFeeCents);

  return {
    stripeFeeCents,
    helpioFeeCents,
    totalFeeCents,
    netCents,
  };
};

/* -------------------------------------------------------
   APPLY REFUND SIDE-EFFECTS (INVOICE)
-------------------------------------------------------- */

const applyInvoiceRefundSideEffects = async ({
  provider,
  client,
  invoice,
  refundAmount,
  mode,
  reason,
  stripeRefundId = null,
  paymentIntentId = null,
  idempotencyKey,
}) => {
  const totalSafe = safeNum(invoice.total);
  const alreadyRefunded = safeNum(invoice.refundedAmount || 0);
  const newRefunded = alreadyRefunded + refundAmount;

  invoice.refundedAmount = newRefunded;

  // Basic status logic
  if (newRefunded >= totalSafe - 0.0001) {
    invoice.status = "REFUNDED";
  } else if (invoice.status === "PAID") {
    invoice.status = "PARTIAL_REFUND";
  }

  await invoice.save();

  

  // Ledger entry — negative amounts to reverse previous credit
  const grossCents = Math.floor(refundAmount * 100);
  const { stripeFeeCents, helpioFeeCents, totalFeeCents, netCents } =
    computeFeesForGrossCents(grossCents);

  let ledgerResult = null;
  try {
    ledgerResult = await recordInvoicePaymentLedger({
      providerId: provider._id,
      customerId: client?._id || null,
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber || null,
      stripePaymentIntentId: paymentIntentId || null,
      grossAmountCents: -grossCents,
      feeAmountCents: 0, // fees handling can be tuned later
      netAmountCents: -netCents,
      settlementDays: 7,
      trigger: mode === "simulated" ? "invoice_refund_simulated" : "invoice_refund_live",
      metadata: {
        refund: true,
        reason: reason || null,
        stripeRefundId,
        idempotencyKey,
        mode,
        stripeFeeCents,
        helpioFeeCents,
        totalFeeCents,
        netCents,
      },
    });
  } catch (ledgerErr) {
    console.error("❌ Ledger error (invoice refund):", ledgerErr.message);
  }

  return {
    invoice,
    ledgerEntry: ledgerResult?.entry || null,
    providerBalance: ledgerResult?.balance || null,
  };
};

/* -------------------------------------------------------
   APPLY REFUND SIDE-EFFECTS (SUBSCRIPTION)
   Note: This does NOT alter subscription cycles/status,
   it only handles money flow & ledger.
-------------------------------------------------------- */

const applySubscriptionRefundSideEffects = async ({
  provider,
  client,
  subscription,
  refundAmount,
  mode,
  reason,
  stripeRefundId = null,
  paymentIntentId = null,
  idempotencyKey,
}) => {
  const grossCents = Math.floor(refundAmount * 100);
  const { stripeFeeCents, helpioFeeCents, totalFeeCents, netCents } =
    computeFeesForGrossCents(grossCents);

  let ledgerResult = null;
  try {
    ledgerResult = await recordSubscriptionChargeLedger({
      providerId: provider._id,
      customerId: client?._id || null,
      subscriptionId: subscription._id,
      planId: subscription.plan || null,
      stripePaymentIntentId: paymentIntentId || null,
      grossAmountCents: -grossCents,
      feeAmountCents: 0,
      netAmountCents: -netCents,
      settlementDays: 7,
      trigger:
        mode === "simulated"
          ? "subscription_refund_simulated"
          : "subscription_refund_live",
      metadata: {
        refund: true,
        reason: reason || null,
        stripeRefundId,
        idempotencyKey,
        mode,
        stripeFeeCents,
        helpioFeeCents,
        totalFeeCents,
        netCents,
      },
    });
  } catch (ledgerErr) {
    console.error("❌ Ledger error (subscription refund):", ledgerErr.message);
  }

  return {
    subscription,
    ledgerEntry: ledgerResult?.entry || null,
    providerBalance: ledgerResult?.balance || null,
  };
};

/* -------------------------------------------------------
   REFUND INVOICE
   POST /refunds/invoice
-------------------------------------------------------- */
export const refundInvoice = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 401, "Unauthorized");

    const {
      invoiceId,
      amount, // optional: if omitted → refund full remaining total
      reason,
      idempotencyKey,
      paymentIntentId, // optional, but required if live+Stripe
    } = req.body;

    if (!invoiceId || !isValidId(invoiceId)) {
      return sendError(res, 400, "Valid invoiceId is required.");
    }
    if (!idempotencyKey) {
      return sendError(res, 400, "idempotencyKey is required.");
    }

    const invoice = await Invoice.findOne({
      _id: invoiceId,
      provider: provider._id,
    }).populate("customer");

    if (!invoice) return sendError(res, 404, "Invoice not found.");

    const client = invoice.customer || null;
    const currency = normalizeCurrency("usd"); // invoices currently in USD in your flows

    const totalSafe = safeNum(invoice.total);
    const alreadyRefunded = safeNum(invoice.refundedAmount || 0);
    const remaining = Math.max(0, totalSafe - alreadyRefunded);

    if (remaining <= 0) {
      return sendError(res, 400, "Invoice is already fully refunded.");
    }

    const amountSafe =
      amount != null && !Number.isNaN(Number(amount))
        ? safeNum(amount)
        : remaining;

    if (amountSafe <= 0) {
      return sendError(res, 400, "Refund amount must be greater than 0.");
    }
    if (amountSafe - remaining > 0.0001) {
      return sendError(
        res,
        400,
        "Refund amount exceeds remaining refundable amount."
      );
    }

    const refundAmount = amountSafe;
    const refundAmountCents = Math.floor(refundAmount * 100);

    // For now, the frontend should pass the corresponding PaymentIntent id
    const effectivePaymentIntentId = paymentIntentId || null;

    /* ---------------------------------------------------
       IDEMPOTENCY RESERVE
    ---------------------------------------------------- */
    let idem;
    try {
      idem = await reserveIdempotencyKey({
        key: idempotencyKey,
        type: "invoice_refund",
        amount: refundAmountCents,
        currency,
        invoiceId: invoice._id,
        providerId: provider._id,
        customerId: client?._id || null,
        initiatedBy: "api",
        payloadForHash: {
          invoiceId: invoice._id.toString(),
          providerId: provider._id.toString(),
          customerId: client?._id?.toString() || null,
          refundAmountCents,
          currency,
        },
        extraContext: { route: "refundInvoice" },
      });
    } catch (err) {
      return sendError(res, 400, err.message);
    }

    if (idem.status === "existing_completed") {
      return res.json({
        success: true,
        mode: "replayed",
        message: "Refund already completed.",
        refundId: idem.record.stripeRefundId || null,
      });
    }

    if (idem.status === "existing_in_progress") {
      return sendError(res, 409, "A refund with this idempotency key is in progress.");
    }

    if (idem.status === "existing_failed") {
      return sendError(
        res,
        409,
        "A previous refund attempt with this key failed. Use a new key."
      );
    }

    const idemId = idem.record._id;

    /* ---------------------------------------------------
       SIMULATED MODE OR NO STRIPE PI
    ---------------------------------------------------- */
    if (
      isSimulatedStripe ||
      !stripeClient ||
      !isLiveStripe ||
      !effectivePaymentIntentId
    ) {
      try {
        const sideEffects = await applyInvoiceRefundSideEffects({
          provider,
          client,
          invoice,
          refundAmount,
          mode: "simulated",
          reason,
          stripeRefundId: null,
          paymentIntentId: effectivePaymentIntentId,
          idempotencyKey,
        });

        await markIdempotencyKeyCompleted(idemId, {
          stripeRefundId: null,
          extraContext: { simulated: true },
        });

        return res.json({
          success: true,
          mode: "simulated",
          invoice: sideEffects.invoice,
          refund: {
            id: null,
            amount: refundAmountCents,
            currency,
            status: "succeeded",
            simulated: true,
          },
          ledgerEntry: sideEffects.ledgerEntry || null,
          providerBalance: sideEffects.providerBalance || null,
        });
      } catch (err) {
        await markIdempotencyKeyFailed(idemId, {
          extraContext: { error: err.message },
        });
        console.error("❌ Simulated invoice refund error:", err);
        return sendError(
          res,
          500,
          "Server error processing simulated invoice refund."
        );
      }
    }

    /* ---------------------------------------------------
       LIVE STRIPE REFUND
    ---------------------------------------------------- */
    let stripeRefund;
    try {
      stripeRefund = await stripeClient.refunds.create(
        {
          payment_intent: effectivePaymentIntentId,
          amount: refundAmountCents,
          reason: reason || undefined,
        },
        {
          idempotencyKey,
        }
      );
    } catch (err) {
      await markIdempotencyKeyFailed(idemId, {
        extraContext: { stripeError: err.message, code: err.code },
      });
      console.error("❌ Stripe refund error (invoice):", err);
      return sendError(res, 500, "Helpio Pay refund failed at processor level.");
    }

    if (
      stripeRefund.status === "succeeded" ||
      stripeRefund.status === "pending"
    ) {
      const sideEffects = await applyInvoiceRefundSideEffects({
        provider,
        client,
        invoice,
        refundAmount,
        mode: "live",
        reason,
        stripeRefundId: stripeRefund.id,
        paymentIntentId: effectivePaymentIntentId,
        idempotencyKey,
      });

      await markIdempotencyKeyCompleted(idemId, {
        stripeRefundId: stripeRefund.id,
        extraContext: { status: stripeRefund.status },
      });

      return res.json({
        success: true,
        mode: "live",
        invoice: sideEffects.invoice,
        refund: {
          id: stripeRefund.id,
          amount: stripeRefund.amount,
          currency: stripeRefund.currency,
          status: stripeRefund.status,
        },
        ledgerEntry: sideEffects.ledgerEntry || null,
        providerBalance: sideEffects.providerBalance || null,
      });
    }

    await markIdempotencyKeyFailed(idemId, {
      extraContext: { status: stripeRefund.status },
    });

    return res.status(402).json({
      success: false,
      mode: "live",
      message: "Helpio Pay could not complete this refund.",
      status: stripeRefund.status,
    });
  } catch (err) {
    console.error("❌ refundInvoice error:", err);
    return sendError(res, 500, "Server error processing invoice refund.");
  }
};

/* -------------------------------------------------------
   REFUND SUBSCRIPTION
   POST /refunds/subscription
   Notes:
   - For v1, we require:
     subscriptionId, amount, idempotencyKey, paymentIntentId
-------------------------------------------------------- */
export const refundSubscription = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 401, "Unauthorized");

    const {
      subscriptionId,
      amount,
      reason,
      idempotencyKey,
      paymentIntentId,
    } = req.body;

    if (!subscriptionId || !isValidId(subscriptionId)) {
      return sendError(res, 400, "Valid subscriptionId is required.");
    }
    if (!idempotencyKey) {
      return sendError(res, 400, "idempotencyKey is required.");
    }
    if (!amount && !paymentIntentId) {
      // encourage explicit refund shape for subscriptions
      return sendError(
        res,
        400,
        "amount and paymentIntentId are required for subscription refunds."
      );
    }

    const subscription = await Subscription.findOne({
      _id: subscriptionId,
      provider: provider._id,
    })
      .populate("client")
      .populate("plan");

    if (!subscription) {
      return sendError(res, 404, "Subscription not found.");
    }

    const client = subscription.client || null;
    const currency = normalizeCurrency(subscription.plan?.currency || "usd");

    const amountSafe = safeNum(amount);
    if (!amountSafe || amountSafe <= 0) {
      return sendError(res, 400, "Valid refund amount is required.");
    }

    const refundAmount = amountSafe;
    const refundAmountCents = Math.floor(refundAmount * 100);

    const effectivePaymentIntentId = paymentIntentId || null;

    /* ---------------------------------------------------
       IDEMPOTENCY RESERVE
    ---------------------------------------------------- */
    let idem;
    try {
      idem = await reserveIdempotencyKey({
        key: idempotencyKey,
        type: "subscription_refund",
        amount: refundAmountCents,
        currency,
        subscriptionId: subscription._id,
        providerId: provider._id,
        customerId: client?._id || null,
        initiatedBy: "api",
        payloadForHash: {
          subscriptionId: subscription._id.toString(),
          providerId: provider._id.toString(),
          customerId: client?._id?.toString() || null,
          refundAmountCents,
          currency,
        },
        extraContext: { route: "refundSubscription" },
      });
    } catch (err) {
      return sendError(res, 400, err.message);
    }

    if (idem.status === "existing_completed") {
      return res.json({
        success: true,
        mode: "replayed",
        message: "Refund already completed.",
        refundId: idem.record.stripeRefundId || null,
      });
    }

    if (idem.status === "existing_in_progress") {
      return sendError(res, 409, "A refund with this idempotency key is in progress.");
    }

    if (idem.status === "existing_failed") {
      return sendError(
        res,
        409,
        "A previous refund attempt with this key failed. Use a new key."
      );
    }

    const idemId = idem.record._id;

    /* ---------------------------------------------------
       SIMULATED OR NO STRIPE
    ---------------------------------------------------- */
    if (
      isSimulatedStripe ||
      !stripeClient ||
      !isLiveStripe ||
      !effectivePaymentIntentId
    ) {
      try {
        const sideEffects = await applySubscriptionRefundSideEffects({
          provider,
          client,
          subscription,
          refundAmount,
          mode: "simulated",
          reason,
          stripeRefundId: null,
          paymentIntentId: effectivePaymentIntentId,
          idempotencyKey,
        });

        await markIdempotencyKeyCompleted(idemId, {
          stripeRefundId: null,
          extraContext: { simulated: true },
        });

        return res.json({
          success: true,
          mode: "simulated",
          subscription: sideEffects.subscription,
          refund: {
            id: null,
            amount: refundAmountCents,
            currency,
            status: "succeeded",
            simulated: true,
          },
          ledgerEntry: sideEffects.ledgerEntry || null,
          providerBalance: sideEffects.providerBalance || null,
        });
      } catch (err) {
        await markIdempotencyKeyFailed(idemId, {
          extraContext: { error: err.message },
        });
        console.error("❌ Simulated subscription refund error:", err);
        return sendError(
          res,
          500,
          "Server error processing simulated subscription refund."
        );
      }
    }

    /* ---------------------------------------------------
       LIVE STRIPE REFUND
    ---------------------------------------------------- */
    let stripeRefund;
    try {
      stripeRefund = await stripeClient.refunds.create(
        {
          payment_intent: effectivePaymentIntentId,
          amount: refundAmountCents,
          reason: reason || undefined,
        },
        {
          idempotencyKey,
        }
      );
    } catch (err) {
      await markIdempotencyKeyFailed(idemId, {
        extraContext: { stripeError: err.message, code: err.code },
      });
      console.error("❌ Stripe refund error (subscription):", err);
      return sendError(res, 500, "Helpio Pay refund failed at processor level.");
    }

    if (
      stripeRefund.status === "succeeded" ||
      stripeRefund.status === "pending"
    ) {
      const sideEffects = await applySubscriptionRefundSideEffects({
        provider,
        client,
        subscription,
        refundAmount,
        mode: "live",
        reason,
        stripeRefundId: stripeRefund.id,
        paymentIntentId: effectivePaymentIntentId,
        idempotencyKey,
      });

      await markIdempotencyKeyCompleted(idemId, {
        stripeRefundId: stripeRefund.id,
        extraContext: { status: stripeRefund.status },
      });

      return res.json({
        success: true,
        mode: "live",
        subscription: sideEffects.subscription,
        refund: {
          id: stripeRefund.id,
          amount: stripeRefund.amount,
          currency: stripeRefund.currency,
          status: stripeRefund.status,
        },
        ledgerEntry: sideEffects.ledgerEntry || null,
        providerBalance: sideEffects.providerBalance || null,
      });
    }

    await markIdempotencyKeyFailed(idemId, {
      extraContext: { status: stripeRefund.status },
    });

    return res.status(402).json({
      success: false,
      mode: "live",
      message: "Helpio Pay could not complete this refund.",
      status: stripeRefund.status,
    });
  } catch (err) {
    console.error("❌ refundSubscription error:", err);
    return sendError(res, 500, "Server error processing subscription refund.");
  }
};
