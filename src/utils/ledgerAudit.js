// src/utils/ledgerAudit.js
import mongoose from "mongoose";
import LedgerEntry from "../models/LedgerEntry.js";
import ProviderBalance from "../models/ProviderBalance.js";
import { ensureProviderBalance } from "./ledger.js";

const { Types } = mongoose;

/* ---------------------------------------------
 * Local helpers (duplicated to avoid circular imports)
---------------------------------------------- */
const normalizeCurrency = (currency) => {
  if (!currency || typeof currency !== "string") return "usd";
  return currency.toLowerCase();
};

const normalizeAmountCents = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.floor(n);
};

const now = () => new Date();

/* ---------------------------------------------
 * Recompute balances for a provider+currency
 * from LedgerEntry rows ONLY (posted entries).
---------------------------------------------- */
export const recomputeProviderBalanceFromLedger = async (
  providerId,
  currency = "usd",
  { dryRun = true } = {}
) => {
  if (!providerId) {
    throw new Error("providerId is required for ledger audit");
  }

  const providerObjectId = new Types.ObjectId(providerId);
  const normalizedCurrency = normalizeCurrency(currency);
  const currentTime = now();

  // Load all posted ledger entries for this provider+currency
  const entries = await LedgerEntry.find({
    provider: providerObjectId,
    currency: normalizedCurrency,
    status: "posted",
  })
    .sort({ effectiveAt: 1, createdAt: 1 })
    .lean();

  let available = 0;
  let pending = 0;
  let reserved = 0;

  let lifetimeGross = 0;
  let lifetimeFees = 0;
  let lifetimeNet = 0;

  // Walk through ledger and simulate balances
  for (const entry of entries) {
    const amt = normalizeAmountCents(entry.amount || 0);
    const sign = entry.direction === "credit" ? 1 : -1;

    switch (entry.type) {
      case "charge": {
        // For charges, we respect settlement status/window
        const isSettled =
          entry.isSettled ||
          (entry.availableAt &&
            new Date(entry.availableAt).getTime() <= currentTime.getTime());

        if (isSettled) {
          available += amt * sign;
        } else {
          pending += amt * sign;
        }
        break;
      }

      case "refund": {
        // Refunds reverse previous effects; treat similarly to charge
        const isSettled =
          entry.isSettled ||
          (entry.availableAt &&
            new Date(entry.availableAt).getTime() <= currentTime.getTime());

        if (isSettled) {
          available += amt * sign;
        } else {
          pending += amt * sign;
        }
        break;
      }

      case "payout": {
        // Money leaving platform to provider (usually debit)
        available += amt * sign;
        break;
      }

      case "adjustment": {
        // Manual/admin adjustments hit available directly
        available += amt * sign;
        break;
      }

      case "dispute_opened": {
        // available ↓, reserved ↑
        available -= amt;
        reserved += amt;
        break;
      }

      case "dispute_won": {
        // available ↑, reserved ↓
        available += amt;
        reserved -= amt;
        break;
      }

      case "dispute_lost": {
        // reserved ↓ only
        reserved -= amt;
        break;
      }

      default:
        // "fee", "test", or any other entries that
        // do not directly impact canonical provider balance.
        break;
    }

    // Total is conceptual: usually = available + pending - reserved
    // We'll compute it at the end as a derived field.

    // Lifetime aggregates only for charge entries
    if (entry.type === "charge") {
      const meta = entry.metadata || {};
      const g = normalizeAmountCents(meta.grossAmountCents || 0);
      const f = normalizeAmountCents(meta.feeAmountCents || 0);
      const n = normalizeAmountCents(
        meta.netAmountCents != null ? meta.netAmountCents : g - f
      );

      lifetimeGross += g;
      lifetimeFees += f;
      lifetimeNet += n;
    }
  }

  // Sanity: prevent negative reserved; allow negative total if needed
  reserved = Math.max(0, reserved);
  // pending/available can be slightly negative if ledger is truly broken; we keep as is for diagnostics.

  const total = available + pending - reserved;

  const recomputed = {
    total,
    available,
    pending,
    reserved,
    lifetimeGross,
    lifetimeFees,
    lifetimeNet,
  };

  const balanceDoc = await ensureProviderBalance(providerId, normalizedCurrency);

  const currentBalance = {
    total: normalizeAmountCents(balanceDoc.total || 0),
    available: normalizeAmountCents(balanceDoc.available || 0),
    pending: normalizeAmountCents(balanceDoc.pending || 0),
    reserved: normalizeAmountCents(balanceDoc.reserved || 0),
    lifetimeGross: normalizeAmountCents(balanceDoc.lifetimeGross || 0),
    lifetimeFees: normalizeAmountCents(balanceDoc.lifetimeFees || 0),
    lifetimeNet: normalizeAmountCents(balanceDoc.lifetimeNet || 0),
  };

  const differences = {};
  let hasDifferences = false;

  for (const field of Object.keys(recomputed)) {
    const curr = currentBalance[field];
    const expected = recomputed[field];
    if (curr !== expected) {
      hasDifferences = true;
      differences[field] = {
        current: curr,
        expected,
        delta: expected - curr,
      };
    }
  }

  // Optionally persist the recomputed values
  if (!dryRun && hasDifferences) {
    balanceDoc.total = recomputed.total;
    balanceDoc.available = recomputed.available;
    balanceDoc.pending = recomputed.pending;
    balanceDoc.reserved = recomputed.reserved;
    balanceDoc.lifetimeGross = recomputed.lifetimeGross;
    balanceDoc.lifetimeFees = recomputed.lifetimeFees;
    balanceDoc.lifetimeNet = recomputed.lifetimeNet;
    balanceDoc.lastRecalculatedAt = new Date();
    await balanceDoc.save();
  }

  return {
    providerId: providerId.toString(),
    currency: normalizedCurrency,
    ledgerCount: entries.length,
    currentBalance,
    recomputed,
    differences,
    hasDifferences,
  };
};

/* ---------------------------------------------
 * Audit a single provider across all currencies
---------------------------------------------- */
export const auditProviderLedger = async (providerId, { dryRun = true } = {}) => {
  const providerObjectId = new Types.ObjectId(providerId);

  // Find currencies either from ProviderBalance or LedgerEntry
  const balanceCurrencies = await ProviderBalance.distinct("currency", {
    provider: providerObjectId,
  });

  const ledgerCurrencies = await LedgerEntry.distinct("currency", {
    provider: providerObjectId,
    status: "posted",
  });

  const currencies = Array.from(
    new Set(
      [...balanceCurrencies, ...ledgerCurrencies].map((c) =>
        normalizeCurrency(c)
      )
    )
  );

  const results = [];

  for (const currency of currencies) {
    const summary = await recomputeProviderBalanceFromLedger(
      providerId,
      currency,
      { dryRun }
    );
    results.push(summary);
  }

  const hasAnyDifferences = results.some((r) => r.hasDifferences);

  return {
    providerId: providerId.toString(),
    currencies,
    hasAnyDifferences,
    results,
  };
};

/* ---------------------------------------------
 * Audit ALL providers (for admin dashboard)
---------------------------------------------- */
export const auditAllProvidersLedger = async ({
  limit = 100,
  dryRun = true,
} = {}) => {
  // Choose provider list from ProviderBalance to be efficient
  const providerIds = await ProviderBalance.distinct("provider");

  const limitedProviderIds = providerIds.slice(0, limit);

  const providerSummaries = [];

  for (const providerId of limitedProviderIds) {
    const summary = await auditProviderLedger(providerId, { dryRun });
    providerSummaries.push(summary);
  }

  const totalProviders = providerIds.length;
  const providersWithIssues = providerSummaries.filter(
    (p) => p.hasAnyDifferences
  ).length;

  return {
    totalProviders,
    scannedProviders: providerSummaries.length,
    providersWithIssues,
    providerSummaries,
  };
};
