// src/controllers/stripeWebhookController.js
import {
  stripeClient,
  isLiveStripe,
  isSimulatedStripe,
} from "../config/stripe.js";

import {
  reserveWebhookEvent,
  markWebhookCompleted,
  markWebhookFailed,
} from "../utils/webhookIdempotency.js";

import {
  logWebhookReceived,
  logWebhookCompleted,
  logWebhookFailed,
} from "../utils/webhookLogger.js";

import LedgerEntry from "../models/LedgerEntry.js";
import Dispute from "../models/Dispute.js";
import Payout from "../models/Payout.js";
import ProviderBalance from "../models/ProviderBalance.js";

import {
  recordDisputeOpenedLedger,
  recordDisputeWonLedger,
  recordDisputeLostLedger,
} from "../utils/ledger.js";

/* ============================================================
   HELPERS
============================================================ */

const isHelpioPayPaymentIntent = (pi) => {
  if (!pi || !pi.metadata) return false;
  const { brand, type, source } = pi.metadata;
  if (brand === "Helpio Pay") return true;
  if (source === "helpio_pay") return true;
  if (typeof type === "string" && type.startsWith("helpio_")) return true;
  return false;
};

const computeFeesForGrossCents = (grossCents) => {
  const stripeFeeCents = Math.round(grossCents * 0.029 + 30);
  const helpioFeeCents = Math.round(grossCents * 0.01);
  const totalFeeCents = stripeFeeCents + helpioFeeCents;
  const netCents = Math.max(0, grossCents - totalFeeCents);
  return { stripeFeeCents, helpioFeeCents, totalFeeCents, netCents };
};

/* ============================================================
   LEDGER AUDIT FOR PAYMENTS
============================================================ */

const auditLedgerForPaymentIntent = async (paymentIntent, eventId) => {
  if (!paymentIntent?.id) return;

  try {
    const existing = await LedgerEntry.findOne({
      stripePaymentIntentId: paymentIntent.id,
    }).lean();

    if (!existing) {
      const grossCents =
        typeof paymentIntent.amount_received === "number"
          ? paymentIntent.amount_received
          : paymentIntent.amount ?? 0;

      const { stripeFeeCents, helpioFeeCents, netCents } =
        computeFeesForGrossCents(grossCents);

      const msg = `MISSING_LEDGER_FOR_PI:${paymentIntent.id} gross=${grossCents} stripeFee=${stripeFeeCents} helpioFee=${helpioFeeCents} net=${netCents}`;
      console.error("❌ Ledger audit: " + msg);
      await logWebhookFailed(eventId, msg);
    }
  } catch (err) {
    console.error(`⚠️ Ledger audit exception:`, err.message);
  }
};

/* ============================================================
   PAYMENT HANDLERS
============================================================ */

const handlePaymentIntentSucceeded = async (event) => {
  const pi = event.data?.object || {};

  console.log("✅ payment_intent.succeeded:", {
    id: pi.id,
    status: pi.status,
    amount: pi.amount,
    metadata: pi.metadata,
  });

  if (isHelpioPayPaymentIntent(pi)) {
    await auditLedgerForPaymentIntent(pi, event.id);
  }
};

const handlePaymentIntentFailed = async (event) => {
  const pi = event.data?.object || {};

  console.warn("⚠️ payment_intent.payment_failed:", {
    id: pi.id,
    last_error: pi.last_payment_error?.message,
  });
};

/* ============================================================
   REFUND HANDLER
============================================================ */

const handleChargeRefunded = async (event) => {
  const charge = event.data?.object || {};

  console.log("ℹ️ charge.refunded:", {
    id: charge.id,
    payment_intent: charge.payment_intent,
  });

  if (!charge.payment_intent) return;

  try {
    const paymentIntentId = charge.payment_intent;

    const result = await LedgerEntry.updateMany(
      { stripePaymentIntentId: paymentIntentId },
      {
        $set: {
          "metadata.refunded": true,
          "metadata.refundStripeChargeId": charge.id,
          "metadata.refundAmountCents": charge.amount_refunded ?? 0,
        },
        $addToSet: { "metadata.refundWebhookEventIds": event.id },
      }
    );

    if (!result.matchedCount) {
      const msg = `REFUND_WITHOUT_LEDGER: charge=${charge.id}`;
      console.warn("⚠️ " + msg);
      await logWebhookFailed(event.id, msg);
    }
  } catch (err) {
    await logWebhookFailed(event.id, err.message);
  }
};

/* ============================================================
   DISPUTE HANDLERS
============================================================ */

const handleChargeDisputeCreated = async (event) => {
  const dispute = event.data?.object || {};

  console.warn("⚠️ charge.dispute.created:", { id: dispute.id });

  try {
    const chargeId = dispute.charge;
    const paymentIntentId = dispute.payment_intent;

    let ledgerEntry =
      (chargeId &&
        (await LedgerEntry.findOne({ stripeChargeId: chargeId })
          .sort({ createdAt: -1 })
          .exec())) ||
      (paymentIntentId &&
        (await LedgerEntry.findOne({ stripePaymentIntentId: paymentIntentId })
          .sort({ createdAt: -1 })
          .exec()));

    if (!ledgerEntry) {
      await logWebhookFailed(
        event.id,
        `DISPUTE_WITHOUT_LEDGER:${dispute.id}`
      );
      return;
    }

    const providerId = ledgerEntry.provider;
    const amountCents = dispute.amount ?? 0;
    const currency = dispute.currency || "usd";

    let disputeDoc = await Dispute.findOne({
      processorDisputeId: dispute.id,
    });

    if (!disputeDoc) {
      disputeDoc = await Dispute.create({
        provider: providerId,
        amount: amountCents,
        currency,
        invoice: ledgerEntry.invoice,
        subscriptionCharge: ledgerEntry.subscriptionCharge,
        processorType: "stripe",
        processorDisputeId: dispute.id,
        processorChargeId: chargeId,
        processorPaymentIntentId: paymentIntentId,
        status: dispute.status || "open",
      });
    }

    if (!disputeDoc.openedLedgerEntry && amountCents > 0) {
      const opened = await recordDisputeOpenedLedger({
        providerId,
        amount: amountCents,
        currency,
        referenceType: ledgerEntry.sourceType,
        referenceId:
          ledgerEntry.invoice ||
          ledgerEntry.subscriptionCharge ||
          ledgerEntry.subscription,
        disputeId: disputeDoc._id,
      });

      disputeDoc.openedLedgerEntry = opened._id;
      await disputeDoc.save();
    }

    await LedgerEntry.updateOne(
      { _id: ledgerEntry._id },
      {
        $set: {
          "metadata.underDispute": true,
          "metadata.dispute": {
            id: dispute.id,
            amountCents,
            status: dispute.status || "open",
          },
        },
      }
    );
  } catch (err) {
    await logWebhookFailed(event.id, err.message);
  }
};

const handleChargeDisputeClosed = async (event) => {
  const dispute = event.data?.object || {};

  console.warn("ℹ️ charge.dispute.closed:", { id: dispute.id });

  try {
    let disputeDoc = await Dispute.findOne({
      processorDisputeId: dispute.id,
    });

    if (!disputeDoc) return;

    const status = dispute.status;
    disputeDoc.status = status;
    disputeDoc.closedAt = new Date();

    let resolution = null;

    if (!disputeDoc.resolutionLedgerEntry && disputeDoc.amount > 0) {
      if (status === "won") {
        resolution = await recordDisputeWonLedger({
          providerId: disputeDoc.provider,
          amount: disputeDoc.amount,
          currency: disputeDoc.currency,
          referenceId:
            disputeDoc.invoice ||
            disputeDoc.subscriptionCharge ||
            disputeDoc.terminalPaymentId,
          disputeId: disputeDoc._id,
        });
      } else if (status === "lost") {
        resolution = await recordDisputeLostLedger({
          providerId: disputeDoc.provider,
          amount: disputeDoc.amount,
          currency: disputeDoc.currency,
          referenceId:
            disputeDoc.invoice ||
            disputeDoc.subscriptionCharge ||
            disputeDoc.terminalPaymentId,
          disputeId: disputeDoc._id,
        });
      }

      if (resolution) disputeDoc.resolutionLedgerEntry = resolution._id;
    }

    await disputeDoc.save();

    await LedgerEntry.updateMany(
      { "metadata.dispute.id": dispute.id },
      {
        $set: {
          "metadata.dispute.status": status,
          "metadata.underDispute": false,
        },
      }
    );
  } catch (err) {
    await logWebhookFailed(event.id, err.message);
  }
};

/* ============================================================
   NEW — B18-E PAYOUT RECONCILIATION ENGINE
============================================================ */

/** payout.paid */
const handlePayoutPaid = async (event) => {
  const payout = event.data?.object || {};

  console.log("💸 payout.paid:", payout.id);

  const stripePayoutId = payout.id;
  const amount = payout.amount;
  const arrival = payout.arrival_date
    ? new Date(payout.arrival_date * 1000)
    : new Date();

  const payoutDoc = await Payout.findOne({ stripePayoutId }).exec();
  if (!payoutDoc) return; // not a Helpio payout

  payoutDoc.status = "paid";
  payoutDoc.arrivalDate = arrival;
  payoutDoc.metadata = {
    ...payoutDoc.metadata,
    stripeBalanceTx: payout.balance_transaction,
  };
  await payoutDoc.save();

  await LedgerEntry.updateOne(
    { _id: payoutDoc.ledgerEntry },
    {
      $set: {
        "metadata.payout_paid_from_webhook": true,
        "metadata.stripePayoutId": stripePayoutId,
      },
    }
  );
};

/** payout.failed — re-credit funds + create reversal ledger entry */
const handlePayoutFailed = async (event) => {
  const payout = event.data?.object || {};

  console.warn("❌ payout.failed:", payout.id);

  const stripePayoutId = payout.id;
  const amount = payout.amount;

  const payoutDoc = await Payout.findOne({ stripePayoutId }).exec();
  if (!payoutDoc) return;

  payoutDoc.status = "failed";
  payoutDoc.failureReason = payout.failure_message || "unknown";
  await payoutDoc.save();

  // Re-credit provider balance
  let balance = await ProviderBalance.findOne({
    provider: payoutDoc.provider,
    currency: payoutDoc.currency,
  });

  if (balance) {
    balance.available += amount;
    balance.total += amount;
    await balance.save();

    // Create reversal ledger
    await LedgerEntry.create({
      provider: payoutDoc.provider,
      type: "payout_reversal",
      direction: "credit",
      amount,
      currency: payoutDoc.currency,
      sourceType: "payout",
      payout: payoutDoc._id,
      metadata: {
        stripePayoutId,
        reason: payout.failure_message,
      },
      effectiveAt: new Date(),
      availableAt: new Date(),
      createdBy: "system",
    });
  }
};

const handlePayoutCanceled = async (event) => {
  const payout = event.data?.object || {};
  console.warn("⚠️ payout.canceled:", payout.id);

  const stripePayoutId = payout.id;
  const amount = payout.amount;

  const payoutDoc = await Payout.findOne({ stripePayoutId }).exec();
  if (!payoutDoc) return;

  payoutDoc.status = "canceled";
  await payoutDoc.save();

  // Re-credit provider balance
  let balance = await ProviderBalance.findOne({
    provider: payoutDoc.provider,
    currency: payoutDoc.currency,
  });

  if (balance) {
    balance.available += amount;
    balance.total += amount;
    await balance.save();

    await LedgerEntry.create({
      provider: payoutDoc.provider,
      type: "payout_reversal",
      direction: "credit",
      amount,
      currency: payoutDoc.currency,
      sourceType: "payout",
      payout: payoutDoc._id,
      metadata: {
        stripePayoutId,
        canceled: true,
      },
      effectiveAt: new Date(),
      availableAt: new Date(),
    });
  }
};

/* ============================================================
   INVOICE PAYMENT EVENTS (informational)
============================================================ */

const handleInvoicePaymentSucceeded = async (event) => {
  console.log("invoice.payment_succeeded", event.data?.object?.id);
};

const handleInvoicePaymentFailed = async (event) => {
  console.log("invoice.payment_failed", event.data?.object?.id);
};

/* ============================================================
   MASTER WEBHOOK HANDLER
============================================================ */

export const stripeWebhookHandler = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  /* -------------------------
     Signature Verification
  ------------------------- */
  try {
    const verify =
      stripeClient && webhookSecret && isLiveStripe && !isSimulatedStripe;

    if (verify) {
      if (!sig) return res.status(400).send("Missing signature");

      try {
        event = stripeClient.webhooks.constructEvent(
          req.body,
          sig,
          webhookSecret
        );
      } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }
    } else {
      event = JSON.parse(
        Buffer.isBuffer(req.body) ? req.body.toString("utf8") : req.body
      );
      console.warn("⚠️ Webhook in NON-verified mode");
    }
  } catch (err) {
    return res.status(400).send("Webhook Error: Invalid payload");
  }

  if (event?.id) await logWebhookReceived(event);

  /* -------------------------
     IDEMPOTENCY
  ------------------------- */
  let idem;
  try {
    idem = await reserveWebhookEvent(event);
  } catch (err) {
    await logWebhookFailed(event.id, err.message);
    return res.json({ received: true, error: true });
  }

  if (idem.status === "completed")
    return res.json({ received: true, replay: true });
  if (idem.status === "failed")
    return res.json({ received: true, skipped: true });
  if (idem.status === "in_progress")
    return res.json({ received: true });

  const idemId = idem.record._id;

  /* -------------------------
     PROCESS EVENT
  ------------------------- */
  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event);
        break;

      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(event);
        break;

      case "charge.refunded":
        await handleChargeRefunded(event);
        break;

      case "charge.dispute.created":
        await handleChargeDisputeCreated(event);
        break;

      case "charge.dispute.closed":
        await handleChargeDisputeClosed(event);
        break;

      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event);
        break;

      /** ⭐ NEW — STRIPE PAYOUT EVENTS */
      case "payout.paid":
        await handlePayoutPaid(event);
        break;

      case "payout.failed":
        await handlePayoutFailed(event);
        break;

      case "payout.canceled":
        await handlePayoutCanceled(event);
        break;

      default:
        console.log("ℹ️ Unhandled event:", event.type);
    }

    await markWebhookCompleted(idemId);
    await logWebhookCompleted(event.id);

    return res.json({ received: true });
  } catch (err) {
    await markWebhookFailed(idemId, err.message);
    await logWebhookFailed(event.id, err.message);
    return res.json({ received: true, error: true });
  }
};
