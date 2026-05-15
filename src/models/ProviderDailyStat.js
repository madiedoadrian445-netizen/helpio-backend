// src/models/ProviderDailyStat.js
import mongoose from "mongoose";

const ProviderDailyStatSchema = new mongoose.Schema(
  {
    // FIX #48 — single index removed, compound index below covers it
    provider_id:    { type: mongoose.Schema.Types.ObjectId, required: true },
    day:            { type: String, required: true }, // "YYYY-MM-DD"
    impressions:    { type: Number, default: 0 },
    leads:          { type: Number, default: 0 },
    cooldown_until: { type: Date, default: null },
  },
  { timestamps: true }
);

// Compound unique index — primary lookup for feed stats
// Also covers solo provider_id queries so no separate index needed
ProviderDailyStatSchema.index({ provider_id: 1, day: 1 }, { unique: true });

export default mongoose.model("ProviderDailyStat", ProviderDailyStatSchema);
