// src/models/SettlementBatch.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * SettlementBatch
 *
 * Represents a single settlement run (T+7 release).
 * Every batch groups multiple ledger entries that became available.
 *
 * This model allows:
 *  - Batch-level reconciliation
 *  - History logs for audits
 *  - UI visibility into settlement runs
 */

const settlementBatchSchema = new Schema(
  {
    batchId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    /**
     * Each batch corresponds to a settlementCron run.
     */
    runAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    /**
     * Summary totals for the batch.
     */
    totalEntries: {
      type: Number,
      default: 0,
    },

    totalAmount: {
      type: Number, // cents
      default: 0,
    },

    /**
     * Optional breakdown per provider.
     */
    providers: [
      {
        provider: { type: Schema.Types.ObjectId, ref: "Provider" },
        currency: { type: String, default: "usd" },
        entryCount: { type: Number, default: 0 },
        amount: { type: Number, default: 0 }, // cents
      },
    ],

    /**
     * Metadata for debugging / auditing.
     */
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

const SettlementBatch = mongoose.model(
  "SettlementBatch",
  settlementBatchSchema
);

export default SettlementBatch;
