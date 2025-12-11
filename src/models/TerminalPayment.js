// src/models/TerminalPayment.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * TerminalPayment
 *
 * Canonical record of in-person (Tap-to-Pay) Helpio Pay transactions.
 * All amounts stored in CENTS.
 */
const terminalPaymentSchema = new Schema(
  {
    /* ----------------------------------
     * CORE RELATIONSHIPS
     * -------------------------------- */
    provider: {
      type: Schema.Types.ObjectId,
      ref: "Provider",
      required: true,
      index: true,
    },

    customer: {
  type: Schema.Types.ObjectId,
  ref: "Customer",  // matches CRM timeline
},


    invoice: {
      type: Schema.Types.ObjectId,
      ref: "Invoice",
    },

    subscription: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
    },

    subscriptionCharge: {
      type: Schema.Types.ObjectId,
      ref: "SubscriptionCharge",
    },

    ledgerEntry: {
      type: Schema.Types.ObjectId,
      ref: "LedgerEntry",
    },

    /* ----------------------------------
     * STRIPE / HELPIO PAY IDENTIFIERS
     * -------------------------------- */
    mode: {
      type: String,
      enum: ["live", "simulated"],
      default: "simulated",
      index: true,
    },

    terminalType: {
      type: String,
      enum: ["invoice", "subscription", "generic"],
      default: "generic",
      index: true,
    },

    paymentIntentId: {
      type: String,
      index: true,
    },

    chargeId: {
      type: String,
      index: true,
    },

    currency: {
      type: String,
      default: "usd",
      lowercase: true,
      trim: true,
    },

    /* ----------------------------------
     * AMOUNTS (CENTS) – CANONICAL
     * -------------------------------- */
    amountGross: {
      type: Number, // full collected amount (cents)
      default: 0,
    },

    amountNet: {
      type: Number, // after all fees (cents)
      default: 0,
    },

    amountFees: {
      type: Number, // total fees (network + Helpio) in cents
      default: 0,
    },

    stripeFeeCents: {
      type: Number,
      default: 0,
    },

    helpioFeeCents: {
      type: Number,
      default: 0,
    },

    /* ----------------------------------
     * LIFECYCLE AMOUNTS (CENTS)
     * -------------------------------- */
    amountAuthorizedCents: {
      type: Number,
      default: 0,
    },

    amountCapturedCents: {
      type: Number,
      default: 0,
    },

    amountRefundedCents: {
      type: Number,
      default: 0,
    },

    /* ----------------------------------
     * TERMINAL DEVICE INFO
     * -------------------------------- */
    readerId: {
      type: String,
    },

    readerLabel: {
      type: String,
    },

    /* ----------------------------------
     * PAYMENT STATUS / LIFECYCLE
     * -------------------------------- */
    status: {
      type: String, // e.g. succeeded, requires_capture, canceled, failed, refunded
      default: "succeeded",
      index: true,
    },

    captureMethod: {
      type: String, // manual / automatic
    },

    settlementDate: {
      type: Date, // T+7 or other per-provider rules
    },

    authorizedAt: {
      type: Date,
    },

    capturedAt: {
      type: Date,
    },

    canceledAt: {
      type: Date,
    },

    failedAt: {
      type: Date,
    },

    description: {
      type: String,
    },

    /* ----------------------------------
     * MISC / AUDIT / FRAUD
     * -------------------------------- */
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Helpful indexes:
 *  - provider + createdAt for reports
 *  - paymentIntentId and chargeId for Stripe reconciliation
 *  - fraud score for admin sorting (if present)
 */
terminalPaymentSchema.index({ provider: 1, createdAt: -1 });
terminalPaymentSchema.index({ paymentIntentId: 1 });
terminalPaymentSchema.index({ chargeId: 1 });
terminalPaymentSchema.index({ "metadata.fraud.fraudScore": -1, createdAt: -1 });

/* ----------------------------------
 * Clean JSON output
 * -------------------------------- */
terminalPaymentSchema.set("toJSON", {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  },
});

const TerminalPayment = mongoose.model("TerminalPayment", terminalPaymentSchema);

export default TerminalPayment;
