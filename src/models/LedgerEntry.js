// src/models/LedgerEntry.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * LedgerEntry
 *
 * Single source-of-truth for ALL money movements
 * from the perspective of the provider.
 *
 * Amounts are stored in CENTS (integer) for accuracy.
 */
const ledgerEntrySchema = new Schema(
  {
    provider: {
      type: Schema.Types.ObjectId,
      ref: "Provider",
      required: true,
      index: true,
    },

    // FIXED: CRM uses "Customer", not "Client"
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      index: true,
    },

    type: {
      type: String,
      enum: [
        "charge",
        "refund",
        "adjustment",
        "payout",
        "dispute_hold",
        "dispute_release",
        "fee",
        "test",
      ],
      required: true,
      index: true,
    },

    direction: {
      type: String,
      enum: ["credit", "debit"],
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      default: "usd",
      lowercase: true,
      trim: true,
      index: true,
    },

    sourceType: {
  type: String,
  enum: [
    "invoice",
    "subscription",
    "subscription_charge",
    "terminal",          // ✅ REQUIRED
    "payout",
    "refund",
    "dispute",
    "adjustment",
    "system",
    "test",
  ],
  required: true,
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
    payout: {
      type: Schema.Types.ObjectId,
      ref: "Payout",
    },

    stripePaymentIntentId: { type: String, index: true },
    stripeChargeId: { type: String, index: true },
    stripePayoutId: { type: String, index: true },
    stripeBalanceTransactionId: { type: String, index: true },
    stripeDisputeId: { type: String, index: true },

    effectiveAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    availableAt: {
      type: Date,
      index: true,
    },

    runningBalance: {
      type: Number,
    },

    status: {
      type: String,
      enum: ["pending", "posted", "void"],
      default: "posted",
      index: true,
    },

    notes: {
      type: String,
      trim: true,
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },

    createdBy: {
      type: String,
      enum: ["system", "cron", "admin", "provider"],
      default: "system",
    },

    // Settlement Engine Fields
    isSettled: {
      type: Boolean,
      default: false,
      index: true,
    },

    settledAt: {
      type: Date,
      index: true,
    },

    settlementBatchId: {
      type: String,
      index: true,
    },

    pendingUntil: {
      type: Date,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
ledgerEntrySchema.index({ provider: 1, createdAt: -1 });
ledgerEntrySchema.index({ provider: 1, availableAt: 1 });
ledgerEntrySchema.index({ provider: 1, isSettled: 1, pendingUntil: 1 });

const LedgerEntryModel = mongoose.model("LedgerEntry", ledgerEntrySchema);

// ⭐ FIXED: default + named export
export const LedgerEntry = LedgerEntryModel;
export default LedgerEntryModel;
