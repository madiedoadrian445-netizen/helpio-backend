// scripts/sim.rollupDaily.js
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";

import Provider from "../src/models/Provider.js";
import Conversation from "../src/models/Conversation.js";
import { ProviderDailyStats } from "../src/models/ProviderDailyStats.js";

// SAFETY
if (process.env.NODE_ENV === "production") {
  throw new Error("❌ Refusing to run rollups in production");
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

async function runDailyRollup() {
  console.log("📊 Running provider daily rollups...");
  await connectDB();

  const date = todayUTC();

  const providers = await Provider.find({
    isSuspended: false
  }).select("_id honeymoonStart honeymoonEnd");

  for (const provider of providers) {
    // Count unique conversations today
    const convoCount = await Conversation.countDocuments({
      providerId: provider._id,
      createdAt: {
        $gte: new Date(`${date}T00:00:00Z`),
        $lt: new Date(`${date}T23:59:59Z`)
      }
    });

    // 🔮 Impression estimation (simulation only)
    // Later this comes from real feed logs
    const impressions = Math.max(convoCount * 18, 5);

    const conversionRate =
      impressions > 0 ? convoCount / impressions : 0;

    const isHoneymoon =
      provider.honeymoonStart &&
      provider.honeymoonEnd &&
      Date.now() >= provider.honeymoonStart &&
      Date.now() <= provider.honeymoonEnd;

    // Normalized score (simple v1)
    const performanceScore = Math.min(
      1,
      conversionRate * (isHoneymoon ? 0.9 : 1.1)
    );

    await ProviderDailyStats.updateOne(
      { providerId: provider._id, date },
      {
        $set: {
          impressions,
          uniqueConversationStarts: convoCount,
          conversionRate,
          isHoneymoon,
          performanceScore
        }
      },
      { upsert: true }
    );
  }

  console.log("✅ Provider daily rollups complete");
  await mongoose.connection.close();
  process.exit(0);
}

runDailyRollup().catch(err => {
  console.error("❌ Rollup error:", err);
  process.exit(1);
});
