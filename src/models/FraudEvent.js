// src/models/FraudEvent.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const TriggerSchema = new Schema(
  {
    ruleId: { type: String, required: true },
    level: {
      type: String,
      enum: ["info", "warning", "critical"],
      default: "warning",
    },
    message: { type: String },
  },
  { _id: false }
);

const FraudEventSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    provider: {
      type: Schema.Types.ObjectId,
      ref: "Provider",
    },

    ip: { type: String },
    userAgent: { type: String },

    route: { type: String },
    method: { type: String },

    amount: { type: Number, default: 0 }, // cents
    currency: {
      type: String,
      default: "usd",
      lowercase: true,
      trim: true,
    },

    decision: {
      type: String,
      enum: ["allow", "review", "block"],
      required: true,
    },

    score: { type: Number, default: 0 },

    triggers: { type: [TriggerSchema], default: [] },

    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

FraudEventSchema.index({ createdAt: -1 });
FraudEventSchema.index({ user: 1, createdAt: -1 });
FraudEventSchema.index({ provider: 1, createdAt: -1 });
FraudEventSchema.index({ ip: 1, createdAt: -1 });

/* -------------------------------------------------------
   ⭐ FIXED: Export BOTH — named + default
-------------------------------------------------------- */
export const FraudEvent = mongoose.model("FraudEvent", FraudEventSchema);
export default FraudEvent;
