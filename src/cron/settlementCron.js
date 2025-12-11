// src/cron/settlementCron.js

import mongoose from "mongoose";
import LedgerEntry from "../models/LedgerEntry.js";
import ProviderBalance from "../models/ProviderBalance.js";

/**
 * Helpio Settlement Engine — B13
 *
 * Criteria for settlement:
 *  - status: "posted"
 *  - direction: "credit"
 *  - isSettled = false
 *  - pendingUntil <= now   (T+7 or custom)
 *
 * Steps:
 *  1. Find eligible ledger rows
 *  2. Group by provider+currency
 *  3. Move amounts from pending → available
 *  4. Update ProviderBalance
 *  5. Mark ledger rows as settled (isSettled = true)
 *  6. Assign settlement batch ID
 */

export const runSettlementCron = async () => {
  const now = new Date();
  console.log(`🕒 Running Helpio Settlement Cron @ ${now.toISOString()}`);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const batchId = `settle_${now.toISOString()}`;

    // 1️⃣ Find all eligible entries
    const entries = await LedgerEntry.find({
      status: "posted",
      direction: "credit",
      isSettled: false,                // NEW B12 field
      pendingUntil: { $lte: now },     // NEW settlement window logic
    })
      .sort({ pendingUntil: 1 })
      .lean();

    if (!entries.length) {
      console.log("ℹ️ No ledger entries eligible for settlement.");
      await session.commitTransaction();
      session.endSession();
      return;
    }

    console.log(`🔎 Found ${entries.length} entries to settle.`);

    // Group by provider+currency
    const grouped = {};
    for (const e of entries) {
      const key = `${e.provider}_${e.currency}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(e);
    }

    // 2️⃣ Process each provider group atomically
    for (const key of Object.keys(grouped)) {
      const [providerId, currency] = key.split("_");
      const group = grouped[key];

      let balance = await ProviderBalance.findOne({
        provider: providerId,
        currency,
      }).session(session);

      if (!balance) {
        console.warn(
          `⚠️ Missing ProviderBalance for provider=${providerId}, currency=${currency}`
        );
        continue;
      }

      let pendingDelta = 0;
      let availableDelta = 0;

      for (const entry of group) {
        const amt = entry.amount;

        pendingDelta -= amt;
        availableDelta += amt;
      }

      // 3️⃣ Apply deltas to ProviderBalance
      balance.pending += pendingDelta;
      balance.available += availableDelta;

      balance.total =
        balance.available + balance.pending - (balance.reserved || 0);
      balance.lastRecalculatedAt = now;

      await balance.save({ session });

      // 4️⃣ Mark ledger entries as settled
      await LedgerEntry.updateMany(
        { _id: { $in: group.map((e) => e._id) } },
        {
          $set: {
            isSettled: true,
            settledAt: now,
            settlementBatchId: batchId,
          },
        },
        { session }
      );

      console.log(
        `💰 Settled ${group.length} entries for provider=${providerId} (${currency}).`
      );
      console.log(`   → pending: ${pendingDelta}, available: +${availableDelta}`);
    }

    // 5️⃣ Commit
    await session.commitTransaction();
    session.endSession();

    console.log(`✅ Settlement batch completed → ${batchId}\n`);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ Settlement Cron Error:", err);
  }
};
