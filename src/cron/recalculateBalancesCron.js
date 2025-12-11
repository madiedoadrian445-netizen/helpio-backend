// src/cron/recalculateBalancesCron.js
import Provider from "../models/Provider.js";
import { recalcProviderBalance } from "../utils/recalculateProviderBalance.js";

export const nightlyBalanceRecalculation = async () => {
  console.log("🔄 Starting nightly provider balance recalculation...");

  const providers = await Provider.find({}, "_id");

  for (const p of providers) {
    try {
      await recalcProviderBalance(p._id, "usd");
      console.log(`✔️ Recalculated balance for provider ${p._id}`);
    } catch (err) {
      console.error(`❌ Error recalculating provider ${p._id}:`, err);
    }
  }

  console.log("✨ Nightly recalculation complete.");
};
