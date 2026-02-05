// src/models/ProviderDailyStats.js
import mongoose from "mongoose";

const providerDailyStatsSchema = new mongoose.Schema(
  {
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Provider",
      required: true,
      index: true
    },

    date: {
      type: String, // YYYY-MM-DD (UTC)
      required: true,
      index: true
    },

    // Exposure
    impressions: {
      type: Number,
      default: 0,
      min: 0
    },

    // Core conversion signal
    uniqueConversationStarts: {
      type: Number,
      default: 0,
      min: 0
    },

    // Derived metrics
    conversionRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 1
    },

    // State flags
    isHoneymoon: {
      type: Boolean,
      default: false
    },

    // Future-ready
    avgResponseTimeSec: {
      type: Number,
      default: null
    },

    // Final normalized score (0–1)
    performanceScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 1
    }
  },
  { timestamps: true }
);

// One rollup per provider per day
providerDailyStatsSchema.index(
  { providerId: 1, date: 1 },
  { unique: true }
);

export const ProviderDailyStats = mongoose.model(
  "ProviderDailyStats",
  providerDailyStatsSchema
);
