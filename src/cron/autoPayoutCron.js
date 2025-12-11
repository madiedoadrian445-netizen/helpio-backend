// src/cron/autoPayoutCron.js

import mongoose from "mongoose";
import ProviderBalance from "../models/ProviderBalance.js";
import Payout from "../models/Payout.js";
import LedgerEntry from "../models/LedgerEntry.js";
import Provider from "../models/Provider.js";

import {
  reserveIdempotencyKey,
  markIdempotencyKeyCompleted,
  markIdempotencyKeyFailed,
} from "../utils/idempotency.js";

const MIN_PAYOUT_CENTS = 100; // $1 minimum
const DAILY_BATCH_KEY = () => {
  const d = new Date();
  return `auto_payout_${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
};

/**
 * Automated Payout Engine (B18-C)
 *
 * Runs daily:
 *  1. Idempotency lock for daily batch
 *  2. Finds all providers with available > threshold
 *  3. Creates payout row
 *  4. Deducts provider available balance
 *  5. Creates ledger entry
 *  6. Marks payout "paid"
 *
 * Fully atomic & error-safe.
 */
export const runAutoPayoutCron = async () => {
  const now = new Date();
  const batchKey = DAILY_BATCH_KEY();

  console.log(`🏦 Running Auto-Payout Cron @ ${now.toISOString()}`);

  // 1️⃣ GLOBAL IDEMPOTENCY — prevents double processing
  let idem;
  try {
    idem = await reserveIdempotencyKey({
      key: batchKey,
      type: "auto_payout_batch",
      initiatedBy: "cron",
      payloadForHash: { batchKey },
      extraContext: { route: "runAutoPayoutCron" },
    });
  } catch (err) {
    console.warn("⚠️ Auto-Payout skipped (idempotency lock):", err.message);
    return;
  }

  if (idem.status !== "fresh") {
    console.log("ℹ️ Auto-Payout already processed today → skipping.");
    return;
  }

  const idemId = idem.record._id;

  // 2️⃣ Fetch provider balances eligible for payout
  const balances = await ProviderBalance.find({
    available: { $gte: MIN_PAYOUT_CENTS },
  }).lean();

  if (!balances.length) {
    console.log("ℹ️ No providers eligible for auto-payouts today.");

    await markIdempotencyKeyCompleted(idemId, {
      payouts: 0,
      extraContext: { note: "no_balances" },
    });

    return;
  }

  console.log(`🔎 ${balances.length} providers eligible for payout.`);

  let payoutCount = 0;
  const results = [];

  for (const bal of balances) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const amount = bal.available;
      const currency = bal.currency;

      // Verify provider exists
      const provider = await Provider.findById(bal.provider)
        .select("_id businessName")
        .lean();
      if (!provider) {
        throw new Error(`Provider ${bal.provider} not found`);
      }

      // 3️⃣ Reload balance inside transaction for accuracy
      const balanceDoc = await ProviderBalance.findById(bal._id).session(session);
      if (!balanceDoc || balanceDoc.available < MIN_PAYOUT_CENTS) {
        throw new Error("Balance changed or insufficient during processing");
      }

      // 4️⃣ Create payout record
      const [payout] = await Payout.create(
        [
          {
            provider: provider._id,
            amount,
            netAmount: amount,
            payoutFee: 0,
            taxWithheld: 0,
            currency,
            status: "processing",
            createdBy: "cron",
            settlementDate: now,
            method: "manual",
            description: `Automated payout batch ${batchKey}`,
            metadata: { batchKey },
            lockedAt: now,
          },
        ],
        { session }
      );

      // 5️⃣ Deduct the balance
      balanceDoc.available -= amount;
      balanceDoc.total = Math.max(
        0,
        balanceDoc.available + balanceDoc.pending - balanceDoc.reserved
      );
      balanceDoc.lastRecalculatedAt = now;
      await balanceDoc.save({ session });

      // 6️⃣ Ledger entry (official payout debit)
      const [ledger] = await LedgerEntry.create(
        [
          {
            provider: provider._id,
            type: "payout",
            direction: "debit",
            amount,
            currency,
            sourceType: "payout",
            payout: payout._id,
            effectiveAt: now,
            availableAt: now,
            createdBy: "cron",
            metadata: {
              batchKey,
              autoPayout: true,
            },
          },
        ],
        { session }
      );

      // 7️⃣ Finalize payout
      payout.status = "paid";
      payout.ledgerEntry = ledger._id;
      payout.arrivalDate = now;
      await payout.save({ session });

      await session.commitTransaction();
      session.endSession();

      console.log(`💸 Auto-Payout Success → provider=${provider._id}, amount=${amount}c`);

      results.push({
        providerId: provider._id,
        amount,
        payoutId: payout._id,
        ledgerId: ledger._id,
      });

      payoutCount++;
    } catch (err) {
      await session.abortTransaction();
      session.endSession();

      console.error(
        `❌ Auto-Payout Error for provider=${bal.provider}:`,
        err.message
      );
    }
  }

  // 8️⃣ Finalize idempotency record
  await markIdempotencyKeyCompleted(idemId, {
    payouts: payoutCount,
    results,
    extraContext: { batchKey },
  });

  console.log(`✅ Auto-Payout Batch Complete → ${batchKey} | total: ${payoutCount}`);
};
