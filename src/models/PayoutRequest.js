// src/models/PayoutRequest.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * PayoutRequest
 *
 * Represents a provider asking Helpio Pay to send money
 * from their available balance to their connected bank / debit.
 *
 * All monetary amounts are stored in CENTS.
 */

const payoutRequestSchema = new Schema(
  {
    provider: {
      type: Schema.Types.ObjectId,
      ref: "Provider",
      required: true,
      index: true,
    },

    // Optional: a specific user who initiated this payout (e.g. owner)
    initiatedByUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    // Amount to send out (in cents)
    amountCents: {
      type: Number,
      required: true,
      min: 1,
    },

    // Currency (lowercase; e.g. "usd")
    currency: {
      type: String,
      default: "usd",
      lowercase: true,
      trim: true,
    },

    /**
     * status flow:
     *  - "pending"   → just created, not yet sent to processor
     *  - "processing"→ sent to processor, waiting for webhook/confirmation
     *  - "paid"      → successfully paid out
     *  - "failed"    → payout failed (funds should be reversed in ledger)
     *  - "canceled"  → manually canceled before processing
     */
    status: {
      type: String,
      enum: ["pending", "processing", "paid", "failed", "canceled"],
      default: "pending",
      index: true,
    },

    // Optional reference so ledger + payouts line up
    ledgerEntry: {
      type: Schema.Types.ObjectId,
      ref: "LedgerEntry",
    },

    /**
     * Processor metadata (Stripe or simulated)
     * NOTE: We keep "processor" generic so you can swap in the future
     */
    processor: {
      type: String,
      enum: ["stripe", "simulated", "other"],
      default: "stripe",
    },

    // Stripe payout id (or equivalent in another processor)
    processorPayoutId: {
      type: String,
      index: true,
    },

    // Optional: the balance transaction ID from Stripe
    processorBalanceTransactionId: {
      type: String,
    },

    // When the payout was actually sent to the processor
    processedAt: {
      type: Date,
    },

    // When the payout was confirmed as paid
    paidAt: {
      type: Date,
    },

    // If failed: store why
    failureCode: {
      type: String,
    },

    failureMessage: {
      type: String,
    },

    /**
     * Optional: batch id if we group payouts (future friendly)
     * e.g. nightly payout batch "2025-12-07-usd"
     */
    batchId: {
      type: String,
      index: true,
    },

    // Free-form metadata for audits / UI labels
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Helpful compound index for admin dashboards
payoutRequestSchema.index({ provider: 1, status: 1, createdAt: -1 });

const PayoutRequest = mongoose.model("PayoutRequest", payoutRequestSchema);

export default PayoutRequest;
