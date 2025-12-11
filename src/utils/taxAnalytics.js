// src/utils/taxAnalytics.js
import LedgerEntry from "../models/LedgerEntry.js";

/**
 * Compute tax metrics from ledger entries.
 *
 * Assumptions (adjust if your model differs):
 *  - LedgerEntry.type includes:
 *      "charge" | "refund" | "fee" | "payout" | "dispute" | "tax"
 *  - LedgerEntry.subtype for tax lines:
 *      "sales_tax_collected" | "tax_withheld"
 *  - LedgerEntry.isTaxable (boolean) on charge lines
 *  - LedgerEntry.amount is in CENTS
 *  - LedgerEntry.provider is ObjectId (per-provider breakdown)
 */

export const computeTaxMetricsFromLedger = (entries = []) => {
  const totals = {
    taxableVolume: 0, // total taxable sales
    taxCollected: 0, // total sales tax collected
    taxWithheld: 0, // tax withheld/remitted by platform
    netTaxDelta: 0, // taxCollected - taxWithheld
  };

  // per-provider breakdown: { [providerId]: { taxableVolume, taxCollected, taxWithheld, netTaxDelta } }
  const perProvider = {};

  const getProviderBucket = (providerId) => {
    if (!providerId) return null;
    const key = providerId.toString();
    if (!perProvider[key]) {
      perProvider[key] = {
        provider: key,
        taxableVolume: 0,
        taxCollected: 0,
        taxWithheld: 0,
        netTaxDelta: 0,
      };
    }
    return perProvider[key];
  };

  for (const entry of entries) {
    const amt = Number(entry.amount || 0);
    const providerBucket = getProviderBucket(entry.provider);

    // Taxable volume inferred from charges
    if (entry.type === "charge" && entry.isTaxable) {
      totals.taxableVolume += amt;
      if (providerBucket) providerBucket.taxableVolume += amt;
    }

    // Tax lines
    if (entry.type === "tax") {
      if (entry.subtype === "sales_tax_collected") {
        totals.taxCollected += amt;
        if (providerBucket) providerBucket.taxCollected += amt;
      } else if (entry.subtype === "tax_withheld") {
        totals.taxWithheld += amt;
        if (providerBucket) providerBucket.taxWithheld += amt;
      }
    }
  }

  // Net tax delta = collected - withheld
  totals.netTaxDelta = totals.taxCollected - totals.taxWithheld;

  Object.values(perProvider).forEach((p) => {
    p.netTaxDelta = p.taxCollected - p.taxWithheld;
  });

  return {
    totals,
    perProvider: Object.values(perProvider),
  };
};

/**
 * Fetch ledger entries for a given time range and currency, then compute tax metrics.
 *
 * @param {{ start: Date, end: Date, currency?: string, includeProviders?: boolean }} params
 */
export const getTaxSummaryForRange = async ({
  start,
  end,
  currency = "usd",
  includeProviders = false,
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
    // Only lines relevant to tax:
    type: { $in: ["charge", "tax"] },
  }).lean();

  const { totals, perProvider } = computeTaxMetricsFromLedger(entries);

  return {
    range: { start, end },
    currency: normalizedCurrency,
    totals,
    providers: includeProviders ? perProvider : [],
  };
};
