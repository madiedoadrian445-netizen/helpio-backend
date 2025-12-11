// src/models/Refund.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * Refund Schema
 *
 * Tracks all refunds issued through Helpio Pay, including:
 *  - Invoice refunds
 *  - Subscription charge refunds
 *  - Simulated vs. Live mode
 *  - Refund status
 *  - Stripe IDs
 *  - Ledger linkage
 *  - Idempotency data
 */

const RefundSchema = new Schema(
  {
    provider: {
      type: Schema.Types.ObjectId,
      ref: "Provider",
      required: true,
      index: true,
    },

    customer: {
      type: Schema.Types.ObjectId,
      ref: "Client",
      required: false,
      index: true,
    },

    /* ---- Linked Resources --------------------------------------- */
    invoice: {
      type: Schema.Types.ObjectId,
      ref: "Invoice",
      required: false,
      index: true,
    },

    subscription: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
      required: false,
      index: true,
    },

    /* ---- Payment Processor Identifiers --------------------------- */
    paymentIntentId: {
      type: String,
      required: false,
      index: true,
      trim: true,
      maxlength: 200,
    },

    stripeRefundId: {
      type: String,
      required: false,
      index: true,
      trim: true,
      maxlength: 200,
    },

    /* ---- Refund Details ------------------------------------------ */
    amountCents: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      default: "usd",
      lowercase: true,
      trim: true,
      maxlength: 10,
    },

    reason: {
      type: String,
      required: false,
      trim: true,
      maxlength: 500,
    },

    mode: {
      type: String,
      enum: ["live", "simulated"],
      default: "simulated",
      index: true,
    },

    /* ---- Processor Status ---------------------------------------- */
    status: {
      type: String,
      enum: ["pending", "succeeded", "failed"],
      default: "pending",
      index: true,
    },

    /* ---- Idempotency --------------------------------------------- */
    idempotencyKey: {
      type: String,
      required: true,
      index: true,
      unique: false, // multiple providers may share a key
      trim: true,
      maxlength: 200,
    },

    /* ---- Ledger Linking ------------------------------------------ */
    ledgerEntry: {
      type: Schema.Types.ObjectId,
      ref: "LedgerEntry",
      required: false,
    },

    providerBalance: {
      type: Schema.Types.ObjectId,
      ref: "ProviderBalance",
      required: false,
    },

    /* ---- Metadata saved for audit -------------------------------- */
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

/* ---------------------------------------------------------
   INDEXES
---------------------------------------------------------- */

RefundSchema.index({ provider: 1, createdAt: -1 });
RefundSchema.index({ provider: 1, status: 1, createdAt: -1 });
RefundSchema.index({ invoice: 1, createdAt: -1 });
RefundSchema.index({ subscription: 1, createdAt: -1 });

/* ---- For fast lookup of a refund based on payment record ---- */
RefundSchema.index({ paymentIntentId: 1 });
RefundSchema.index({ stripeRefundId: 1 });

/* ---------------------------------------------------------
   PRE-SAVE NORMALIZATION
---------------------------------------------------------- */

RefundSchema.pre("save", function (next) {
  if (this.currency) {
    this.currency = this.currency.trim().toLowerCase();
  }
  if (this.reason) {
    this.reason = this.reason.trim();
  }
  next();
});

/* ---------------------------------------------------------
   toJSON CLEANUP
---------------------------------------------------------- */

RefundSchema.set("toJSON", {
  transform(doc, ret) {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model("Refund", RefundSchema);
