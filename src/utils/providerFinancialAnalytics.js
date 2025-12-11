// src/utils/providerFinancialAnalytics.js
import LedgerEntry from "../models/LedgerEntry.js";
import ProviderBalance from "../models/ProviderBalance.js";
import Payout from "../models/Payout.js";
import FinancialStatement from "../models/FinancialStatement.js";

/**
 * Compute ledger-based financial totals for a single provider.
 *
 * LedgerEntry types assumed:
 *  - charge
 *  - refund
 *  - dispute
 *  - fee
 *  - tax  (subtype: sales_tax_collected | tax_withheld)
 *  - payout
 */
export const computeProviderLedgerSummary = (entries = []) => {
  const totals = {
    grossEarnings: 0,
    refundsTotal: 0,
    disputesTotal: 0,
    feesTotal: 0,
    taxCollected: 0,
    taxWithheld: 0,
    netEarnings: 0, // gross - refunds - disputes - fees
  };

  for (const e of entries) {
    const amt = Number(e.amount || 0);

    switch (e.type) {
      case "charge":
        totals.grossEarnings += amt;
        break;

      case "refund":
        totals.refundsTotal += Math.abs(amt);
        break;

      case "dispute":
        totals.disputesTotal += Math.abs(amt);
        break;

      case "fee":
        totals.feesTotal += Math.abs(amt);
        break;

      case "tax":
        if (e.subtype === "sales_tax_collected") {
          totals.taxCollected += amt;
        } else if (e.subtype === "tax_withheld") {
          totals.taxWithheld += amt;
        }
        break;

      default:
        break;
    }
  }

  totals.netEarnings =
    totals.grossEarnings -
    totals.refundsTotal -
    totals.disputesTotal -
    totals.feesTotal;

  return totals;
};

/**
 * Get the provider's global financial picture:
 *  - balances
 *  - lifetime ledger earnings
 *  - payouts summary
 *  - monthly statements summary
 *  - recent ledger entries
 */
export const getProviderFinancialOverview = async (providerId) => {
  if (!providerId) throw new Error("Provider ID required");

  // Load balances
  const balance = await ProviderBalance.findOne({ provider: providerId }).lean();

  // Load ledger entries
  const ledgerEntries = await LedgerEntry.find({
    provider: providerId,
  })
    .sort({ effectiveAt: -1 })
    .lean();

  const ledgerSummary = computeProviderLedgerSummary(ledgerEntries);

  // Last 10 ledger entries (for admin UI)
  const recentEntries = ledgerEntries.slice(0, 10);

  // Load payouts
  const payouts = await Payout.find({ provider: providerId })
    .sort({ createdAt: -1 })
    .lean();

  const totalPayouts = payouts.reduce(
    (sum, p) => sum + Number(p.amount || 0),
    0
  );

  // Latest monthly statements
  const statements = await FinancialStatement.find({
    provider: providerId,
  })
    .sort({ periodStart: -1 })
    .limit(12)
    .lean();

  return {
    provider: providerId,
    balances: {
      available: balance?.availableBalance || 0,
      pending: balance?.pendingBalance || 0,
      totalEarned: balance?.lifetimeEarnings || 0, // optional field if you have it
    },
    ledger: {
      summary: ledgerSummary,
      recentEntries,
    },
    payouts: {
      totalPayouts,
      count: payouts.length,
      latest: payouts.slice(0, 5),
    },
    statements,
  };
};
