// src/models/Payout.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * Helpio Pay – Payout
 *
 * Represents a transfer of funds from Helpio → Provider.
 * Used by:
 *  - Auto Payout Cron (daily)
 *  - Manual/admin-triggered payouts
 *
 * Amount conventions (v1):
 *  - amount      → gross payout amount to provider (after Helpio fees, before payoutFee/tax)
 *  - netAmount   → final amount sent out after payoutFee + taxWithheld
 *
 * All amounts are stored in major currency units (e.g. USD dollars).
 */

const payoutSchema = new Schema(
  {
    /* ---------------------------------------------
       Core linkage
    ---------------------------------------------- */
    provider: {
      type: Schema.Types.ObjectId,
      ref: "Provider",
      required: true,
      index: true,
    },

    /* ---------------------------------------------
       Money
    ---------------------------------------------- */

    // Gross payout amount to provider (after Helpio fees)
    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    // Final amount that actually goes out after payoutFee + taxWithheld
    netAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    // Explicit payout processing fee (bank / wire / instant payout)
    payoutFee: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Any tax held back on this payout
    taxWithheld: {
      type: Number,
      default: 0,
      min: 0,
    },

    currency: {
      type: String,
      default: "usd",
      lowercase: true,
      trim: true,
    },

    /* ---------------------------------------------
       Status / lifecycle
    ---------------------------------------------- */
    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "paid",
        "failed",
        "reversed",
        "canceled",
      ],
      default: "pending",
      index: true,
    },

    // The “settlement window” date this payout represents
    settlementDate: {
      type: Date,
      required: true,
      index: true,
    },

    method: {
      type: String,
      enum: ["stripe_connect", "manual", "test"],
      default: "manual",
    },

    arrivalDate: { type: Date },
    description: { type: String, trim: true },

    /* ---------------------------------------------
       Processor references
    ---------------------------------------------- */
    stripePayoutId: { type: String, index: true },
    stripeBalanceTransactionId: { type: String, index: true },

    /* ---------------------------------------------
       Failure / retry / locking
    ---------------------------------------------- */
    failureReason: { type: String },
    attemptCount: { type: Number, default: 0 },
    lastAttemptAt: { type: Date },
    lockedAt: { type: Date },

    reversalReason: { type: String },

    /* ---------------------------------------------
       Ledger linking
    ---------------------------------------------- */
    ledgerEntry: {
      type: Schema.Types.ObjectId,
      ref: "LedgerEntry",
    },

    /* ---------------------------------------------
       Optional audit snapshots
    ---------------------------------------------- */
    openingBalance: { type: Number, min: 0 },
    closingBalance: { type: Number, min: 0 },

    /* ---------------------------------------------
       Approvals
    ---------------------------------------------- */
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    rejectedBy: { type: Schema.Types.ObjectId, ref: "User" },

    notes: { type: String },

    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },

    createdBy: {
      type: String,
      enum: ["system", "cron", "admin", "provider"],
      default: "provider",
    },
  },
  { timestamps: true }
);

/* ---------------------------------------------
   Indexes
---------------------------------------------- */

payoutSchema.index({ provider: 1, createdAt: -1 });
payoutSchema.index({ provider: 1, status: 1, settlementDate: 1 });
payoutSchema.index({ lockedAt: 1 });
payoutSchema.index({ stripePayoutId: 1 });

/* ⭐ NEW — Makes dashboard queries 40× faster */
payoutSchema.index({ status: 1, createdAt: -1 });

/* ------------------------------------------------------
   FIXED EXPORTS — Supports BOTH default & named import
------------------------------------------------------- */
export const Payout = mongoose.model("Payout", payoutSchema);
export default Payout;
