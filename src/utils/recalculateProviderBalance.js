// src/utils/recalculateProviderBalance.js
import LedgerEntry from "../models/LedgerEntry.js";
import ProviderBalance from "../models/ProviderBalance.js";
import mongoose from "mongoose";

const { Types } = mongoose;

/**
 * Recalculate provider balance from scratch using all ledger entries.
 * This guarantees the canonical truth and repairs corruption if any.
 */
export const recalcProviderBalance = async (providerId, currency = "usd") => {
  const normalizedCurrency = currency.toLowerCase();

  if (!Types.ObjectId.isValid(providerId)) {
    throw new Error("Invalid providerId");
  }

  // 1️⃣ Load all ledger entries for this provider & currency
  const entries = await LedgerEntry.find({
    provider: providerId,
    currency: normalizedCurrency,
    status: "posted",
  }).sort({ effectiveAt: 1 }); // oldest → newest

  // 2️⃣ Initialize rollup buckets
  let available = 0;
  let pending = 0;
  let reserved = 0;

  let total = 0;

  // Lifetime aggregates
  let lifetimeGross = 0;
  let lifetimeFees = 0;
  let lifetimeNet = 0;

  // 3️⃣ Replay each ledger entry
  for (const e of entries) {
    const amt = e.amount || 0;
    const isCredit = e.direction === "credit";

    // Lifetime updates
    if (e.type === "charge") {
      lifetimeGross += e.metadata?.grossAmountCents || 0;
      lifetimeFees += e.metadata?.feeAmountCents || 0;

      // credit (provider earnings)
      lifetimeNet += amt;
    }

    switch (e.type) {
      case "charge":
        if (isCredit) {
          pending += amt;
          total += amt;
        } else {
          pending -= amt;
          total -= amt;
        }
        break;

      case "refund":
        if (isCredit) {
          pending += amt;
          total += amt;
        } else {
          pending -= amt;
          total -= amt;
        }
        break;

      case "payout":
        if (isCredit) {
          available += amt;
          total += amt;
        } else {
          available -= amt;
          total -= amt;
        }
        break;

      case "adjustment":
        if (isCredit) {
          available += amt;
          total += amt;
        } else {
          available -= amt;
          total -= amt;
        }
        break;

      // ⭐ DISPUTES
      case "dispute_opened":
        available = Math.max(0, available - amt);
        reserved += amt;
        break;

      case "dispute_won":
        available += amt;
        reserved = Math.max(0, reserved - amt);
        break;

      case "dispute_lost":
        reserved = Math.max(0, reserved - amt);
        break;
    }
  }

  // 4️⃣ Load or create ProviderBalance doc
  const balance = await ProviderBalance.findOneAndUpdate(
    { provider: providerId, currency: normalizedCurrency },
    {
      total,
      available,
      pending,
      reserved,

      lifetimeGross,
      lifetimeFees,
      lifetimeNet,

      lastRecalculatedAt: new Date(),
    },
    { new: true, upsert: true }
  );

  return balance;
};
