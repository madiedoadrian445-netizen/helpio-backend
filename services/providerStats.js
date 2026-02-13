// services/providerStats.js
import ProviderDailyStat from "../models/ProviderDailyStat.js";

/**
 * Returns YYYY-MM-DD in server local time.
 * For Miami V1 this is acceptable.
 * Later we can switch to strict America/New_York with luxon.
 */
function yyyyMmDd(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Increment a provider impression.
 * Used when provider appears in top N feed results.
 */
export async function logImpression(providerId) {
  const day = yyyyMmDd();

  await ProviderDailyStat.updateOne(
    { provider_id: providerId, day },
    { $inc: { impressions: 1 } },
    { upsert: true }
  );
}

/**
 * Log a LEAD for a provider.
 * Lead definition for V1:
 * → user sends quote request (recommended)
 * or → starts chat thread (if you choose that instead)
 *
 * Also applies cooldown throttling to prevent
 * one provider receiving all demand.
 */
export async function logLead(providerId, cooldownMinutes = 45) {
  const day = yyyyMmDd();

  const cooldownUntil = new Date(Date.now() + cooldownMinutes * 60 * 1000);

  await ProviderDailyStat.updateOne(
    { provider_id: providerId, day },
    {
      $inc: { leads: 1 },
      $set: { cooldown_until: cooldownUntil },
    },
    { upsert: true }
  );
}
