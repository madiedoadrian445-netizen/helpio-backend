// src/utils/financialStatements.js
import mongoose from "mongoose";
import LedgerEntry from "../models/LedgerEntry.js"; // adjust path/name if needed
import { FinancialStatement } from "../models/FinancialStatement.js";

const { Types } = mongoose;

/**
 * Normalize currency
 */
const normalizeCurrency = (currency) => {
  if (!currency || typeof currency !== "string") return "usd";
  return currency.toLowerCase();
};

/**
 * Build period dates for a given year + month (1–12)
 */
export const buildMonthlyPeriod = (year, month) => {
  const safeYear = Number(year);
  const safeMonth = Number(month);

  if (
    !Number.isInteger(safeYear) ||
    !Number.isInteger(safeMonth) ||
    safeMonth < 1 ||
    safeMonth > 12
  ) {
    throw new Error("Invalid year or month for financial statement period");
  }

  const periodStart = new Date(Date.UTC(safeYear, safeMonth - 1, 1, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(safeYear, safeMonth, 1, 0, 0, 0)); // first day of next month

  return { periodStart, periodEnd };
};

/**
 * Aggregate totals from ledger entries
 *
 * IMPORTANT:
 *  - Ensure your LedgerEntry model has fields:
 *    - provider (ObjectId)
 *    - amount (Number, in cents)
 *    - currency (String)
 *    - type (String) -> "charge" | "refund" | "fee" | "payout" | "tax" | "dispute"
 *    - subtype (String) -> e.g. "processing_fee", "platform_fee", "sales_tax"
 *    - effectiveAt (Date)
 *
 *  - If names differ, update mappings below.
 */
export const computeStatementFromLedgerEntries = (ledgerEntries = []) => {
  const totals = {
    grossVolume: 0,
    refundsTotal: 0,
    disputesTotal: 0,
    feesTotal: 0,
    payoutsTotal: 0,
    balanceChange: 0,
    netVolume: 0,
  };

  const tax = {
    taxableVolume: 0,
    taxCollected: 0,
    taxWithheld: 0,
  };

  for (const entry of ledgerEntries) {
    const amt = Number(entry.amount || 0);

    // Total balance impact (credits positive, debits negative)
    // If your model uses "direction" / "isCredit" etc, adjust here.
    if (entry.direction === "credit") {
      totals.balanceChange += amt;
    } else if (entry.direction === "debit") {
      totals.balanceChange -= amt;
    }

    switch (entry.type) {
      case "charge": {
        totals.grossVolume += amt;

        // Optionally treat all charges as taxable; or if you track taxable flag:
        if (entry.isTaxable) {
          tax.taxableVolume += amt;
        }
        break;
      }

      case "refund": {
        totals.refundsTotal += Math.abs(amt);
        break;
      }

      case "dispute": {
        totals.disputesTotal += Math.abs(amt);
        break;
      }

      case "fee": {
        totals.feesTotal += Math.abs(amt);
        break;
      }

      case "payout": {
        totals.payoutsTotal += Math.abs(amt);
        break;
      }

      case "tax": {
        // Use subtype to separate sales tax vs withheld/remitted tax
        if (entry.subtype === "sales_tax_collected") {
          tax.taxCollected += amt;
        } else if (entry.subtype === "tax_withheld") {
          tax.taxWithheld += amt;
        } else {
          tax.taxCollected += amt; // default bucket
        }
        break;
      }

      default:
        break;
    }
  }

  // Compute net volume: gross - refunds - disputes - fees
  totals.netVolume =
    totals.grossVolume -
    totals.refundsTotal -
    totals.disputesTotal -
    totals.feesTotal;

  return { totals, tax };
};

/**
 * Compute + persist (or reuse) monthly statement for a provider.
 *
 * - If a FINAL statement already exists for (provider, year, month, currency),
 *   it is returned as-is (idempotent).
 */
export const computeAndPersistMonthlyStatement = async ({
  providerId,
  year,
  month,
  currency = "usd",
  metadata = {},
}) => {
  if (!Types.ObjectId.isValid(providerId)) {
    throw new Error("Invalid providerId for financial statement generation");
  }

  const normalizedCurrency = normalizeCurrency(currency);
  const { periodStart, periodEnd } = buildMonthlyPeriod(year, month);

  // Idempotency: return existing FINAL statement
  let existing = await FinancialStatement.findOne({
    provider: providerId,
    year,
    month,
    currency: normalizedCurrency,
    status: "final",
  });

  if (existing) return existing;

  const ledgerEntries = await LedgerEntry.find({
    provider: providerId,
    currency: normalizedCurrency,
    effectiveAt: {
      $gte: periodStart,
      $lt: periodEnd,
    },
  }).lean();

  const { totals, tax } = computeStatementFromLedgerEntries(ledgerEntries);

  const statement = await FinancialStatement.create({
    provider: providerId,
    year,
    month,
    periodStart,
    periodEnd,
    currency: normalizedCurrency,
    totals,
    tax,
    status: "final",
    metadata: {
      generatedBy: metadata.generatedBy || "system",
      source: metadata.source || "ledger-engine",
      notes: metadata.notes,
    },
  });

  return statement;
};

/**
 * Convert a FinancialStatement doc into CSV string for export.
 * This gives a clean, tax-friendly summary.
 */
export const financialStatementToCsv = (statementDoc) => {
  const s = statementDoc.toObject ? statementDoc.toObject() : statementDoc;

  const lines = [];

  // Header
  lines.push("Helpio Financial Statement");
  lines.push(
    `Provider ID,${s.provider?.toString?.() || s.provider || "unknown"}`
  );
  lines.push(`Year,${s.year}`);
  lines.push(`Month,${s.month}`);
  lines.push(`Currency,${s.currency}`);
  lines.push(
    `Period Start,${new Date(s.periodStart).toISOString().slice(0, 10)}`
  );
  lines.push(
    `Period End,${new Date(s.periodEnd).toISOString().slice(0, 10)}`
  );
  lines.push("");

  // Totals
  lines.push("Section,Metric,Amount (in cents)");
  lines.push(`Totals,Gross Volume,${s.totals.grossVolume}`);
  lines.push(`Totals,Refunds Total,${s.totals.refundsTotal}`);
  lines.push(`Totals,Disputes Total,${s.totals.disputesTotal}`);
  lines.push(`Totals,Fees Total,${s.totals.feesTotal}`);
  lines.push(`Totals,Payouts Total,${s.totals.payoutsTotal}`);
  lines.push(`Totals,Net Volume,${s.totals.netVolume}`);
  lines.push(`Totals,Balance Change,${s.totals.balanceChange}`);
  lines.push("");

  // Tax
  lines.push("Tax Summary,Metric,Amount (in cents)");
  lines.push(`Tax,Taxable Volume,${s.tax.taxableVolume}`);
  lines.push(`Tax,Tax Collected,${s.tax.taxCollected}`);
  lines.push(`Tax,Tax Withheld,${s.tax.taxWithheld}`);

  return lines.join("\n");
};
