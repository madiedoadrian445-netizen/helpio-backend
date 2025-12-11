// src/models/Dispute.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * Helpio Pay – Dispute / Chargeback (B17 Enhanced)
 *
 * Tracks disputes raised against payments across:
 *  - Invoices
 *  - Subscription charges
 *  - Terminal payments
 *
 * Supports:
 *  - Stripe processor disputes
 *  - Simulated processor (dev/test)
 *  - Future processors (Helcim, Adyen, etc.)
 */

const disputeSchema = new Schema(
  {
    /* -----------------------------
       RELATIONSHIPS
    ------------------------------ */

    provider: {
      type: Schema.Types.ObjectId,
      ref: "Provider",
      required: true,
      index: true,
    },

    invoice: {
      type: Schema.Types.ObjectId,
      ref: "Invoice",
    },

    subscriptionCharge: {
      type: Schema.Types.ObjectId,
      ref: "SubscriptionCharge",
    },

    // Internal reference to terminal payments
    terminalPaymentId: {
      type: String,
      trim: true,
    },

    /* -----------------------------
       AMOUNTS
    ------------------------------ */

    amount: {
      type: Number, // cents
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      default: "usd",
      lowercase: true,
      trim: true,
    },

    /* -----------------------------
       PROCESSOR DETAILS
    ------------------------------ */

    processorType: {
      type: String,
      enum: ["stripe", "simulated", "other"],
      default: "simulated",
      index: true,
    },

    processorDisputeId: {
      type: String,
      index: true,
      trim: true,
    },

    processorChargeId: {
      type: String,
      trim: true,
    },

    processorPaymentIntentId: {
      type: String,
      trim: true,
    },

    processorEvidenceDueBy: {
      type: Date,
    },

    processorRaw: {
      type: Schema.Types.Mixed, // Store full webhook payload if desired
      default: {},
    },

    /* -----------------------------
       DISPUTE STATUS
    ------------------------------ */

    status: {
      type: String,
      enum: ["open", "under_review", "won", "lost", "canceled"],
      default: "open",
      index: true,
    },

    reason: {
      type: String,
      trim: true,
    },

    evidence: {
      type: String,
      trim: true,
    },

    evidenceSubmittedAt: {
      type: Date,
    },

    openedAt: {
      type: Date,
      default: Date.now,
    },

    closedAt: {
      type: Date,
    },

    /* -----------------------------
       LEDGER REFERENCES
    ------------------------------ */

    openedLedgerEntry: {
      type: Schema.Types.ObjectId,
      ref: "LedgerEntry",
    },

    resolutionLedgerEntry: {
      type: Schema.Types.ObjectId,
      ref: "LedgerEntry",
    },

    /* -----------------------------
       ADMIN NOTES
    ------------------------------ */

    notes: {
      type: String,
      trim: true,
    },

    /* -----------------------------
       FLEXIBLE METADATA
    ------------------------------ */

    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

/* -----------------------------
   INDEXES
------------------------------ */

// Most common admin queries
disputeSchema.index({ provider: 1, createdAt: -1 });

// Direct lookup from webhook
disputeSchema.index({ processorDisputeId: 1 });

// Status + Provider lookup
disputeSchema.index({ provider: 1, status: 1 });

// Faster filtering on time windows
disputeSchema.index({ createdAt: -1 });

// Full-text search for admin dashboard
disputeSchema.index({
  reason: "text",
  notes: "text",
});

const Dispute = mongoose.model("Dispute", disputeSchema);
export default Dispute;
