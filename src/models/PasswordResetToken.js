// src/models/PasswordResetToken.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * PasswordResetToken
 *  - Separate model so we don't have to touch User schema.
 *  - Stores hashed token + expiry + link to User.
 */

const PasswordResetTokenSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordResetToken = mongoose.model(
  "PasswordResetToken",
  PasswordResetTokenSchema
);
