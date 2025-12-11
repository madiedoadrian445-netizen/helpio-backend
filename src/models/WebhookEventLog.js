// src/models/WebhookEventLog.js
import mongoose from "mongoose";

const WebhookEventLogSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, index: true, unique: true },
    type: { type: String, required: true },
    status: {
      type: String,
      enum: ["received", "completed", "failed"],
      default: "received",
    },

    // Raw metadata from Stripe (safe debugging)
    payload: { type: Object },

    // If webhook idempotency failed
    error: { type: String, default: null },

    // Extra context – useful for future dashboard filters
    livemode: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("WebhookEventLog", WebhookEventLogSchema);
