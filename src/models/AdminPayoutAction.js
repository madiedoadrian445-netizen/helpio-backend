// src/models/AdminPayoutAction.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * AdminPayoutAction
 *
 * Logs *every* admin mutation related to payouts:
 *  - Approval
 *  - Cancellation
 *  - Manual marking as paid
 *  - Any forced reconciliation
 *
 * This enables:
 *  - Full audit history
 *  - Rollback investigation
 *  - Compliance tracking (B17/B18)
 *  - Webhook-safe state transitions
 */

const adminPayoutActionSchema = new Schema(
  {
    payout: {
      type: Schema.Types.ObjectId,
      ref: "Payout",
      required: true,
      index: true,
    },

    admin: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    actionType: {
      type: String,
      enum: [
        "mark_paid",
        "cancel",
        "force_reconcile",
        "note",
        "unlock",
        "lock",
      ],
      required: true,
      index: true,
    },

    reason: {
      type: String,
      trim: true,
    },

    /**
     * Example:
     *  {
     *    oldStatus: "pending",
     *    newStatus: "paid",
     *    oldBalance: 50200,
     *    newBalance: 39000
     *  }
     */
    changes: {
      type: Schema.Types.Mixed,
      default: {},
    },

    /**
     * Ledger entries generated as a result of this admin action.
     * For example:
     * - reversal ledger
     * - manual payout debit
     */
    ledgerEntry: {
      type: Schema.Types.ObjectId,
      ref: "LedgerEntry",
    },

    ipAddress: {
      type: String,
    },

    userAgent: {
      type: String,
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

adminPayoutActionSchema.index({ actionType: 1, createdAt: -1 });
adminPayoutActionSchema.index({ payout: 1, createdAt: -1 });
adminPayoutActionSchema.index({ admin: 1, createdAt: -1 });

export default mongoose.model("AdminPayoutAction", adminPayoutActionSchema);
