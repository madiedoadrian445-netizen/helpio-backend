// controllers/invoicePaymentsController.js
import Invoice from "../models/Invoice.js";
import Client from "../models/Client.js";
import Provider from "../models/Provider.js";

import {
  reserveIdempotencyKey,
  markIdempotencyKeyCompleted,
  markIdempotencyKeyFailed,
} from "../utils/idempotency.js";

import {
  stripeClient,
  isLiveStripe,
  isSimulatedStripe,
} from "../config/stripe.js";

// Lock expires after N seconds
const INVOICE_LOCK_EXPIRE_MS = 120 * 1000; // 2 minutes


/* -------------------------------------------------------
   PAY INVOICE NOW — FULLY HARDENED
-------------------------------------------------------- */
export const payInvoiceNow = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { idempotencyKey } = req.body;

    if (!idempotencyKey) {
      return res
        .status(400)
        .json({ success: false, message: "idempotencyKey is required." });
    }

    const invoice = await Invoice.findById(invoiceId)
      .populate("customer")
      .populate("provider");

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    const now = Date.now();

    /* -------------------------------------------------------
       1) CHECK AND ACQUIRE PAYMENT LOCK
    -------------------------------------------------------- */

    // Reject if locked and NOT expired
    if (invoice.paymentLock && invoice.paymentLockAt) {
      const lockAge = now - invoice.paymentLockAt.getTime();

      if (lockAge < INVOICE_LOCK_EXPIRE_MS) {
        return res.status(409).json({
          success: false,
          locked: true,
          message: "Invoice is already being paid. Try again shortly.",
        });
      }
    }

    // Acquire lock ATOMICALLY
    const locked = await Invoice.findOneAndUpdate(
      {
        _id: invoice._id,
        $or: [
          { paymentLock: false }, // free
          {
            paymentLock: true,
            paymentLockAt: { $lt: new Date(now - INVOICE_LOCK_EXPIRE_MS) }, // expired lock
          },
        ],
      },
      {
        $set: { paymentLock: true, paymentLockAt: new Date() },
      },
      { new: true }
    );

    if (!locked) {
      return res.status(409).json({
        success: false,
        message: "Invoice is currently locked by another payment attempt.",
      });
    }

    /* -------------------------------------------------------
       2) IDEMPOTENCY RESERVATION
    -------------------------------------------------------- */
    const amountInCents = Math.floor(invoice.balance * 100);

    let idem;
    try {
      idem = await reserveIdempotencyKey({
        key: idempotencyKey,
        type: "invoice_paynow",
        amount: amountInCents,
        currency: "usd",
        invoiceId: invoice._id,
        providerId: invoice.provider._id,
        customerId: invoice.customer._id,
        initiatedBy: "api",
        payloadForHash: {
          invoiceId: invoice._id.toString(),
          amount: amountInCents,
        },
        extraContext: { route: "payInvoiceNow" },
      });
    } catch (err) {
      // Release lock
      await Invoice.findByIdAndUpdate(invoice._id, {
        paymentLock: false,
        paymentLockAt: null,
      });

      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }

    // Replay behavior
    if (idem.status === "existing_completed") {
      await Invoice.findByIdAndUpdate(invoice._id, {
        paymentLock: false,
        paymentLockAt: null,
      });

      return res.json({
        success: true,
        replayed: true,
        message: "Invoice payment already completed.",
      });
    }

    if (idem.status === "existing_in_progress") {
      return res.status(409).json({
        success: false,
        message: "Payment already in progress.",
      });
    }

    if (idem.status === "existing_failed") {
      return res.status(409).json({
        success: false,
        message:
          "Previous payment attempt failed. Please generate a new idempotency key.",
      });
    }

    const idemId = idem.record._id;

    /* -------------------------------------------------------
       3) SIMULATED MODE
    -------------------------------------------------------- */
    if (isSimulatedStripe || !stripeClient || !isLiveStripe) {
      await Invoice.findByIdAndUpdate(invoice._id, {
        status: "PAID",
        paid: invoice.total,
        balance: 0,
        paymentLock: false,
        paymentLockAt: null,
      });

      await markIdempotencyKeyCompleted(idemId, {
        stripePaymentIntentId: null,
        extraContext: { simulated: true },
      });

      return res.json({
        success: true,
        mode: "simulated",
        message: "Invoice successfully paid (simulated)",
      });
    }

    /* -------------------------------------------------------
       4) LIVE STRIPE CHARGE
    -------------------------------------------------------- */
    let paymentIntent;
    try {
      paymentIntent = await stripeClient.paymentIntents.create(
        {
          amount: amountInCents,
          currency: "usd",
          customer: invoice.customer.stripeCustomerId,
          confirm: true,
          description: `Invoice Payment: ${invoice._id}`,
          metadata: {
            invoiceId: invoice._id.toString(),
            providerId: invoice.provider._id.toString(),
            source: "helpio_invoice",
          },
        },
        {
          idempotencyKey,
        }
      );
    } catch (err) {
      await markIdempotencyKeyFailed(idemId, {
        extraContext: { stripeError: err.message, code: err.code },
      });

      // release lock
      await Invoice.findByIdAndUpdate(invoice._id, {
        paymentLock: false,
        paymentLockAt: null,
      });

      return res.status(402).json({
        success: false,
        message: "Payment failed",
        stripeError: err.message,
      });
    }

    /* -------------------------------------------------------
       5) HANDLE SUCCESS
    -------------------------------------------------------- */
    await Invoice.findByIdAndUpdate(invoice._id, {
      status: "PAID",
      paid: invoice.total,
      balance: 0,
      paymentLock: false,
      paymentLockAt: null,
    });

    await markIdempotencyKeyCompleted(idemId, {
      stripePaymentIntentId: paymentIntent.id,
      stripeChargeId: paymentIntent.latest_charge || null,
      extraContext: { status: paymentIntent.status },
    });

    return res.json({
      success: true,
      mode: "live",
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
    });
  } catch (err) {
    console.error("❌ payInvoiceNow error:", err);

    return res.status(500).json({
      success: false,
      message: "Server error paying invoice.",
    });
  }
};
