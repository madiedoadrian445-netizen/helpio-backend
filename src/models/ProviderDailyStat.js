// models/ProviderDailyStat.js
import mongoose from "mongoose";

const ProviderDailyStatSchema = new mongoose.Schema(
  {
    provider_id: { type: mongoose.Schema.Types.ObjectId, index: true, required: true },
    day: { type: String, index: true, required: true }, // "YYYY-MM-DD" in America/New_York
    impressions: { type: Number, default: 0 },
    leads: { type: Number, default: 0 },
    cooldown_until: { type: Date, default: null },
  },
  { timestamps: true }
);

ProviderDailyStatSchema.index({ provider_id: 1, day: 1 }, { unique: true });

export default mongoose.model("ProviderDailyStat", ProviderDailyStatSchema);
