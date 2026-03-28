import mongoose from "mongoose";

const phoneVerificationSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
    },

    code: {
      type: String,
      required: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    verified: {
      type: Boolean,
      default: false,
    },

    // ⭐ NEW — ATTEMPT TRACKING
    attempts: {
      type: Number,
      default: 0,
    },

    // ⭐ NEW — LOCK FLAG
    locked: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const PhoneVerification = mongoose.model(
  "PhoneVerification",
  phoneVerificationSchema
);