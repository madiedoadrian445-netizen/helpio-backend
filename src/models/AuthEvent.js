// src/models/AuthEvent.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * AuthEvent — records security-relevant auth actions:
 *  - login_success / login_failed
 *  - logout
 *  - register
 *  - token_refreshed
 *  - password reset lifecycle
 *  - MFA challenge lifecycle
 */

const AuthEventSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },

    type: {
      type: String,
      required: true,
      enum: [
        "login_success",
        "login_failed",
        "logout",
        "register",
        "token_refreshed",

        // Password reset events
        "password_reset_requested",
        "password_reset_email_sent",
        "password_reset_success",
        "password_reset_failed",

        // MFA events
        "mfa_challenge_started",
        "mfa_challenge_verified",
        "mfa_challenge_failed",
      ],
    },

    ip: { type: String },
    userAgent: { type: String },

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

// Helpful indexes for audits
AuthEventSchema.index({ createdAt: -1 });
AuthEventSchema.index({ email: 1, createdAt: -1 });
AuthEventSchema.index({ user: 1, createdAt: -1 });
AuthEventSchema.index({ type: 1, createdAt: -1 });

export const AuthEvent = mongoose.model("AuthEvent", AuthEventSchema);
