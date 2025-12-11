// src/models/MFASession.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * MFASession
 *  - Temporary store for MFA challenge codes.
 *  - You can later integrate this tightly with your login flow.
 */

const MFASessionSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    codeHash: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    consumed: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

MFASessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const MFASession = mongoose.model("MFASession", MFASessionSchema);
