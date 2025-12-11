// src/models/IdempotencyKey.js
import mongoose from "mongoose";

const IdempotencyKeySchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      index: true,
    },

    // What kind of operation this is for
    type: {
      type: String,
      enum: [
        "subscription_charge",
        "invoice_charge",
        "terminal_charge",
        "manual_charge",
      ],
      required: true,
      index: true,
    },

    // Optional scoping identifiers (for debugging & deterministic keys)
    subscription: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription" },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice" },
    provider: { type: mongoose.Schema.Types.ObjectId, ref: "Provider" },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },

    // Stripe objects
    stripePaymentIntentId: { type: String },
    stripeChargeId: { type: String },

    amount: { type: Number, required: true },
    currency: { type: String, required: true },

    // in_progress: we've reserved the key and are charging now
    // completed: charge succeeded; replays should instantly return success
    // failed: charge failed; callers should send a NEW idempotency key
    status: {
      type: String,
      enum: ["in_progress", "completed", "failed"],
      default: "in_progress",
      index: true,
    },

    // Optional hash of the request payload (for debug / integrity checks)
    requestHash: { type: String },

    // Extra context for debugging
    context: { type: Object },

    // Who initiated the charge (for auditing)
    initiatedBy: {
      type: String, // "cron", "api", "terminal"
      default: "api",
      index: true,
    },
  },
  { timestamps: true }
);

// To enforce uniqueness per operation type:
IdempotencyKeySchema.index({ key: 1, type: 1 }, { unique: true });

const IdempotencyKey = mongoose.model("IdempotencyKey", IdempotencyKeySchema);

export default IdempotencyKey;
