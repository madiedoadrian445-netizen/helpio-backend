// src/models/SuspiciousEvent.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * Tracks ALL security anomalies:
 *  - impossible travel
 *  - new login locations
 *  - velocity anomalies
 *  - new devices / fingerprints
 *  - device anomalies
 *  - IP reputation / velocity triggers
 *  - brute force / credential stuffing attacks
 *  - compromised password usage attempts
 */

const SuspiciousEventSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User" },

    type: {
      type: String,
      enum: [
        "impossible_travel",
        "new_location",
        "velocity_anomaly",
        "new_device",
        "device_anomaly",
        "ip_reputation",
        "rapid_logins",
        "attack_bruteforce",
        "attack_credential_stuffing",
        "compromised_password", // ⭐ NEW B22-E
      ],
      required: true,
    },

    riskScore: { type: Number, default: 0 },

    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "low",
    },

    ip: { type: String },
    userAgent: { type: String },

    country: { type: String },
    city: { type: String },
    region: { type: String },
    lat: Number,
    lon: Number,

    previousLogin: {
      ip: String,
      country: String,
      city: String,
      region: String,
      lat: Number,
      lon: Number,
      at: Date,
    },

    metadata: { type: Object, default: {} },
  },
  { timestamps: true }
);

/* ---------------------------------------------------------
   Indexes for admin dashboards & fast lookups
--------------------------------------------------------- */
SuspiciousEventSchema.index({ user: 1, createdAt: -1 });
SuspiciousEventSchema.index({ type: 1, createdAt: -1 });

export const SuspiciousEvent = mongoose.model(
  "SuspiciousEvent",
  SuspiciousEventSchema
);
