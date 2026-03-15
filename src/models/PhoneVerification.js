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
  },
  { timestamps: true }
);

export const PhoneVerification = mongoose.model(
  "PhoneVerification",
  phoneVerificationSchema
);