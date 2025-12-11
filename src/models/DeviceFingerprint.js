// src/models/DeviceFingerprint.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * Tracks devices / browsers seen per user.
 */

const DeviceFingerprintSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // SHA-256 hash of UA + hints
    fingerprintId: {
      type: String,
      required: true,
    },

    label: {
      type: String,
      default: null,
      trim: true,
    },

    userAgent: {
      type: String,
      default: "",
    },

    acceptLanguage: {
      type: String,
      default: "",
    },

    secChUa: {
      type: String,
      default: "",
    },

    secChUaPlatform: {
      type: String,
      default: "",
    },

    firstSeenAt: {
      type: Date,
      default: Date.now,
    },

    lastSeenAt: {
      type: Date,
      default: Date.now,
    },

    timesSeen: {
      type: Number,
      default: 1,
    },

    ipFirst: {
      type: String,
      default: "",
    },

    ipLast: {
      type: String,
      default: "",
    },

    ipSamples: {
      type: [String],
      default: [],
    },

    isTrusted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

DeviceFingerprintSchema.index({ user: 1, fingerprintId: 1 }, { unique: true });
DeviceFingerprintSchema.index({ user: 1, lastSeenAt: -1 });

export const DeviceFingerprint = mongoose.model(
  "DeviceFingerprint",
  DeviceFingerprintSchema
);
