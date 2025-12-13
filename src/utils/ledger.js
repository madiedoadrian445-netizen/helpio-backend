// src/utils/ledger.js
import mongoose from "mongoose";
import LedgerEntry from "../models/LedgerEntry.js";
import ProviderBalance from "../models/ProviderBalance.js";

const { Types } = mongoose;

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/* ---------------------------------------------
 * Currency normalization (USD-focused for now)
---------------------------------------------- */
const normalizeCurrency = (currency) => {
  if (!currency || typeof currency !== "string") return "usd";
  return currency.toLowerCase();
};

/* ---------------------------------------------
 * Safe amount normalization (to integer cents)
---------------------------------------------- */
const normalizeAmountCents = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
};

/* ---------------------------------------------
 * Settlement Date (T+7 default)
---------------------------------------------- */
export const computeSettlementDate = (effectiveAt = new Date(), days = 7) => {
  const d = new Date(effectiveAt);
  d.setDate(d.getDate() + (days || 0));
  return d;
};

/* ---------------------------------------------
 * Ensure ProviderBalance Exists
---------------------------------------------- */
export const ensureProviderBalance = async (providerId, currency = "usd") => {
  const normalizedCurrency = normalizeCurrency(currency);

  const doc = await ProviderBalance.findOneAndUpdate(
    { provider: providerId, currency: normalizedCurrency },
    {
      $setOnInsert: {
        total: 0,
        available: 0,
        pending: 0,
        reserved: 0,
        lifetimeGross: 0,
        lifetimeFees: 0,
        lifetimeNet: 0,
      },
    },
    {
      new: true,
      upsert: true,
    }
  );

  return doc;
};

/* ---------------------------------------------
 * Apply a single ledger entry to ProviderBalance
---------------------------------------------- */
const applyEntryToBalance = (balanceDoc, entry) => {
  if (!entry || entry.status !== "posted") return balanceDoc;

  const isCredit = entry.direction === "credit";
  const amt = normalizeAmountCents(entry.amount);

  switch (entry.type) {
    case "charge":
      if (isCredit) {
        balanceDoc.pending += amt;
        balanceDoc.total += amt;
      } else {
        balanceDoc.pending -= amt;
        balanceDoc.total -= amt;
      }
      break;

    case "refund":
      if (isCredit) {
        balanceDoc.pending += amt;
        balanceDoc.total += amt;
      } else {
        balanceDoc.pending -= amt;
        balanceDoc.total -= amt;
      }
      break;

    case "payout":
      if (isCredit) {
        balanceDoc.available += amt;
        balanceDoc.total += amt;
      } else {
        balanceDoc.available -= amt;
        balanceDoc.total -= amt;
      }
      break;

    case "adjustment":
      if (isCredit) {
        balanceDoc.available += amt;
        balanceDoc.total += amt;
      } else {
        balanceDoc.available -= amt;
        balanceDoc.total -= amt;
      }
      break;

    /* ----------------------------------------------
     * B5 — DISPUTE LOGIC
     ---------------------------------------------- */
    case "dispute_opened":
      balanceDoc.available = Math.max(
        0,
        normalizeAmountCents(balanceDoc.available) - amt
      );
      balanceDoc.reserved = normalizeAmountCents(balanceDoc.reserved) + amt;
      break;

    case "dispute_won":
      balanceDoc.available =
        normalizeAmountCents(balanceDoc.available) + amt;
      balanceDoc.reserved = Math.max(
        0,
        normalizeAmountCents(balanceDoc.reserved) - amt
      );
      break;

    case "dispute_lost":
      balanceDoc.reserved = Math.max(
        0,
        normalizeAmountCents(balanceDoc.reserved) - amt
      );
      break;
  }

  return balanceDoc;
};

/* ---------------------------------------------
 * CHARGE → Ledger (Invoice, Subscription, Terminal, etc.)
---------------------------------------------- */
export const recordChargeLedger = async ({
  providerId,
  customerId = null,
  currency = "usd",
  grossAmountCents,
  feeAmountCents = 0,
  netAmountCents,
  settlementDays = 7,
  sourceType = "invoice",

  // linkage
  invoiceId = null,
  subscriptionId = null,
  subscriptionChargeId = null,
  externalPaymentId = null,
  stripeChargeId = null,
  stripeBalanceTransactionId = null,
  stripePaymentIntentId = null,

  // terminal linkage (stored in metadata)
  terminalPaymentId = null,

  metadata = {},
}) => {
  if (!providerId) {
    throw new Error("providerId is required for recordChargeLedger");
  }

  const normalizedCurrency = normalizeCurrency(currency);

  const gross = normalizeAmountCents(grossAmountCents);
  const fee = normalizeAmountCents(feeAmountCents);

  let net = Number.isFinite(netAmountCents)
    ? normalizeAmountCents(netAmountCents)
    : normalizeAmountCents(gross - fee);

  if (net < 0) net = 0;

  const effectiveAt = new Date();
  const availableAt = computeSettlementDate(effectiveAt, settlementDays);

  const balanceDoc = await ensureProviderBalance(providerId, normalizedCurrency);

  const entry = await LedgerEntry.create({
    provider: new Types.ObjectId(providerId),
    customer: customerId ? new Types.ObjectId(customerId) : undefined,

    type: "charge",
    direction: "credit",
    amount: net,
    currency: normalizedCurrency,
    sourceType,

    invoice: invoiceId ? new Types.ObjectId(invoiceId) : undefined,
    subscription: subscriptionId
      ? new Types.ObjectId(subscriptionId)
      : undefined,
    subscriptionCharge: subscriptionChargeId
      ? new Types.ObjectId(subscriptionChargeId)
      : undefined,

    stripePaymentIntentId:
      stripePaymentIntentId || externalPaymentId || undefined,
    stripeChargeId: stripeChargeId || undefined,
    stripeBalanceTransactionId: stripeBalanceTransactionId || undefined,

    effectiveAt,
    availableAt,
    status: "posted",

    metadata: {
      ...metadata,
      grossAmountCents: gross,
      feeAmountCents: fee,
      netAmountCents: net,
      terminalPaymentId: terminalPaymentId || undefined,
    },
  });

  applyEntryToBalance(balanceDoc, entry);

  balanceDoc.lifetimeGross =
    normalizeAmountCents(balanceDoc.lifetimeGross || 0) + gross;
  balanceDoc.lifetimeFees =
    normalizeAmountCents(balanceDoc.lifetimeFees || 0) + fee;
  balanceDoc.lifetimeNet =
    normalizeAmountCents(balanceDoc.lifetimeNet || 0) + net;

  balanceDoc.lastRecalculatedAt = new Date();
  balanceDoc.total = Math.round(balanceDoc.total || 0);
  balanceDoc.available = Math.round(balanceDoc.available || 0);
  balanceDoc.pending = Math.round(balanceDoc.pending || 0);
  balanceDoc.reserved = Math.round(balanceDoc.reserved || 0);

  await balanceDoc.save();

  entry.runningBalance =
    normalizeAmountCents(balanceDoc.available || 0) +
    normalizeAmountCents(balanceDoc.pending || 0) -
    normalizeAmountCents(balanceDoc.reserved || 0);

  await entry.save();

  return { entry, balance: balanceDoc };
};

/* ---------------------------------------------
 * SUBSCRIPTION CHARGE WRAPPER
---------------------------------------------- */
export const recordSubscriptionChargeLedger = async (params) => {
  return recordChargeLedger({
    ...params,
    sourceType: "subscription_charge",
    metadata: {
      ...params.metadata,
      trigger: params.trigger || "billing_cron",
      planId: params.planId || null,
      chargeContext: "subscription",
    },
  });
};

/* ---------------------------------------------
 * INVOICE PAYMENT WRAPPER
---------------------------------------------- */
export const recordInvoicePaymentLedger = async (params) => {
  return recordChargeLedger({
    ...params,
    sourceType: "invoice",
    metadata: {
      ...params.metadata,
      trigger: params.trigger || "online_checkout",
      invoiceNumber: params.invoiceNumber || null,
      chargeContext: "invoice",
    },
  });
};

/* ---------------------------------------------
 * TERMINAL PAYMENT WRAPPER (B22-aligned)
 *
 * Supports:
 *  - terminalPaymentId (forensics)
 *  - stripePaymentIntentId
 *  - stripeChargeId
 *  - trigger: "terminal_payment_simulated" | "terminal_payment_live" | etc.
---------------------------------------------- */
export const recordTerminalChargeLedger = async ({
  providerId,
  customerId = null,
  currency = "usd",
  grossAmountCents,
  feeAmountCents = 0,
  netAmountCents,
  settlementDays = 7,

  terminalPaymentId = null,
  stripePaymentIntentId = null,
  stripeChargeId = null,
  trigger = "terminal_payment",

  simulated = false,
  metadata = {},
}) => {
  const providerOk = providerId && isValidObjectId(providerId);

  // ✅ SIM: if provider missing/invalid, skip ledger+balance safely
  if (simulated && !providerOk) {
    return { entry: null, balance: null, skipped: true };
  }

  // ✅ REAL: provider MUST be valid
  if (!providerOk) {
    throw new Error("Valid providerId is required for terminal charge ledger.");
  }

  return recordChargeLedger({
    providerId,
    customerId,
    currency,
    grossAmountCents,
    feeAmountCents,
    netAmountCents,
    settlementDays,
    sourceType: "terminal",
    stripePaymentIntentId,
    stripeChargeId,
    terminalPaymentId,
    metadata: {
      ...metadata,
      chargeContext: "terminal",
      trigger,
    },
  });
};


/* ============================================================
 * DISPUTE LEDGER OPERATIONS (UNCHANGED)
============================================================ */

export const recordDisputeOpenedLedger = async ({
  providerId,
  amount,
  currency = "usd",
  referenceType,
  referenceId,
  disputeId,
  effectiveAt = new Date(),
}) => {
  const normalizedCurrency = normalizeCurrency(currency);
  const amt = normalizeAmountCents(amount);

  const entry = await LedgerEntry.create({
    provider: providerId,
    type: "dispute_opened",
    direction: "debit",
    amount: amt,
    currency: normalizedCurrency,
    referenceType,
    referenceId,
    dispute: disputeId,
    effectiveAt,
    status: "posted",
    metadata: { event: "Dispute opened" },
  });

  const balance = await ensureProviderBalance(providerId, normalizedCurrency);

  balance.available = Math.max(
    0,
    normalizeAmountCents(balance.available) - amt
  );
  balance.reserved = normalizeAmountCents(balance.reserved) + amt;

  balance.lastRecalculatedAt = new Date();
  balance.total = Math.round(balance.total || 0);

  await balance.save();

  entry.runningBalance =
    normalizeAmountCents(balance.available || 0) +
    normalizeAmountCents(balance.pending || 0) -
    normalizeAmountCents(balance.reserved || 0);

  await entry.save();

  return entry;
};

export const recordDisputeWonLedger = async ({
  providerId,
  amount,
  currency = "usd",
  referenceType,
  referenceId,
  disputeId,
  effectiveAt = new Date(),
}) => {
  const normalizedCurrency = normalizeCurrency(currency);
  const amt = normalizeAmountCents(amount);

  const entry = await LedgerEntry.create({
    provider: providerId,
    type: "dispute_won",
    direction: "credit",
    amount: amt,
    currency: normalizedCurrency,
    referenceType,
    referenceId,
    dispute: disputeId,
    effectiveAt,
    status: "posted",
    metadata: { event: "Dispute won" },
  });

  const balance = await ensureProviderBalance(providerId, normalizedCurrency);

  balance.available =
    normalizeAmountCents(balance.available) + amt;
  balance.reserved = Math.max(
    0,
    normalizeAmountCents(balance.reserved) - amt
  );

  balance.lastRecalculatedAt = new Date();
  balance.total = Math.round(balance.total || 0);

  await balance.save();

  entry.runningBalance =
    normalizeAmountCents(balance.available || 0) +
    normalizeAmountCents(balance.pending || 0) -
    normalizeAmountCents(balance.reserved || 0);

  await entry.save();

  return entry;
};

export const recordDisputeLostLedger = async ({
  providerId,
  amount,
  currency = "usd",
  referenceType,
  referenceId,
  disputeId,
  effectiveAt = new Date(),
}) => {
  const normalizedCurrency = normalizeCurrency(currency);
  const amt = normalizeAmountCents(amount);

  const entry = await LedgerEntry.create({
    provider: providerId,
    type: "dispute_lost",
    direction: "debit",
    amount: 0,
    currency: normalizedCurrency,
    referenceType,
    referenceId,
    dispute: disputeId,
    effectiveAt,
    status: "posted",
    metadata: { event: "Dispute lost" },
  });

  const balance = await ensureProviderBalance(providerId, normalizedCurrency);

  balance.reserved = Math.max(
    0,
    normalizeAmountCents(balance.reserved) - amt
  );

  balance.lastRecalculatedAt = new Date();
  balance.total = Math.round(balance.total || 0);

  await balance.save();

  entry.runningBalance =
    normalizeAmountCents(balance.available || 0) +
    normalizeAmountCents(balance.pending || 0) -
    normalizeAmountCents(balance.reserved || 0);

  await entry.save();

  return entry;
};
