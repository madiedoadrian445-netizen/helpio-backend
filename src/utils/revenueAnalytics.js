// src/utils/revenueAnalytics.js
import LedgerEntry from "../models/LedgerEntry.js";

/**
 * Compute revenue metrics from a list of ledger entries.
 *
 * IMPORTANT:
 * - Assumes LedgerEntry has at least:
 *      type: "charge" | "refund" | "fee" | "payout" | "dispute" | "tax"
 *      amount: Number (in cents)
 *      direction: "credit" | "debit"  (optional, used mainly in other parts)
 *
 * - Adjust mappings below if your ledger semantics differ.
 */
export const computeRevenueMetricsFromLedger = (entries = []) => {
  const totals = {
    grossVolume: 0,
    refundsTotal: 0,
    disputesTotal: 0,
    feesTotal: 0,
    payoutsTotal: 0,
    netVolume: 0,
    platformRevenue: 0,
  };

  for (const entry of entries) {
    const amt = Number(entry.amount || 0);

    switch (entry.type) {
      case "charge":
        totals.grossVolume += amt;
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

      case "payout":
        totals.payoutsTotal += Math.abs(amt);
        break;

      default:
        break;
    }
  }

  // Net volume = gross - refunds - disputes - fees
  totals.netVolume =
    totals.grossVolume -
    totals.refundsTotal -
    totals.disputesTotal -
    totals.feesTotal;

  // Platform revenue ≈ fees for now (you can add markup, etc. later)
  totals.platformRevenue = totals.feesTotal;

  return totals;
};

/**
 * Fetch ledger entries for a given time range and currency, then compute metrics.
 *
 * @param {{ start: Date, end: Date, currency?: string }} params
 */
export const getRevenueSummaryForRange = async ({
  start,
  end,
  currency = "usd",
}) => {
  if (!(start instanceof Date) || !(end instanceof Date)) {
    throw new Error("start and end must be Date instances");
  }

  const normalizedCurrency = (currency || "usd").toLowerCase();

  const entries = await LedgerEntry.find({
    currency: normalizedCurrency,
    effectiveAt: {
      $gte: start,
      $lt: end,
    },
  }).lean();

  const metrics = computeRevenueMetricsFromLedger(entries);

  return {
    range: {
      start,
      end,
    },
    currency: normalizedCurrency,
    metrics,
  };
};
