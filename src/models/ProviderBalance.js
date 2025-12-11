// src/models/ProviderBalance.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * ProviderBalance
 *
 * Canonical balance sheet for each provider (per currency).
 * All amounts stored in CENTS.
 *
 * Used by:
 *  - Ledger Engine
 *  - Settlement Engine (T+X)
 *  - Payout Engine
 *  - Admin Dashboards
 *  - Provider Earnings Dashboard
 */

const providerBalanceSchema = new Schema(
  {
    /* ---------------------------------------------
       Provider Ownership
    ---------------------------------------------- */
    provider: {
      type: Schema.Types.ObjectId,
      ref: "Provider",
      required: true,
      index: true,
    },

    currency: {
      type: String,
      default: "usd",
      lowercase: true,
      trim: true,
      index: true,
    },

    /* ---------------------------------------------
       Core Balance Buckets (CENTS)
    ---------------------------------------------- */

    total: {
      type: Number,
      default: 0, // Sanity: (available + pending - reserved)
      min: 0,
    },

    available: {
      type: Number,
      default: 0,
      min: 0,
      index: true, // Fast payout queries
    },

    pending: {
      type: Number,
      default: 0,
      min: 0,
    },

    reserved: {
      type: Number,
      default: 0,
      min: 0,
    },

    lastRecalculatedAt: {
      type: Date,
      default: null,
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },

    /* ---------------------------------------------
       Lifetime Aggregates (CENTS)
       Used for admin reports + helpio payout analytics
    ---------------------------------------------- */
    lifetimeGross: {
      type: Number,
      default: 0,
      min: 0,
    },

    lifetimeFees: {
      type: Number,
      default: 0,
      min: 0,
    },

    lifetimeNet: {
      type: Number,
      default: 0,
      min: 0,
    },

    /* ---------------------------------------------
       Last Payout Snapshot (Used for dashboard UI)
    ---------------------------------------------- */
    lastPayoutAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    lastPayoutAt: {
      type: Date,
      default: null,
    },

    lastPayoutBatchId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true }
);

/* ============================================================
   INDEXES (CRITICAL FOR PERFORMANCE)
============================================================ */

// Ensure only 1 balance doc exists per provider & currency
providerBalanceSchema.index(
  { provider: 1, currency: 1 },
  { unique: true }
);

// Fast lookup for payout engine
providerBalanceSchema.index({
  provider: 1,
  available: -1,
});

// Fast lookup for admin dashboards
providerBalanceSchema.index({
  provider: 1,
  updatedAt: -1,
});

// Lifetime aggregates quick lookup
providerBalanceSchema.index({
  provider: 1,
  lifetimeNet: -1,
});

/* ============================================================
   EXPORTS — named + default for reliability
============================================================ */
export const ProviderBalance = mongoose.model(
  "ProviderBalance",
  providerBalanceSchema
);

export default ProviderBalance;
