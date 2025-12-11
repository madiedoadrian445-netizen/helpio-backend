// src/utils/ledgerEngine.js
import mongoose from "mongoose";
import LedgerAccount from "../models/LedgerAccount.js";
import LedgerEntry from "../models/LedgerEntry.js";

const { Types } = mongoose;

const HELP_IO_CURRENCY = "usd";

/* -------------------------------------------------------
   HELPERS
-------------------------------------------------------- */
const toCents = (amount) => {
  const n = Number(amount || 0);
  return Math.round(n * 100);
};

const normalizeCurrency = (c) =>
  typeof c === "string" ? c.toLowerCase() : HELP_IO_CURRENCY;

/* -------------------------------------------------------
   Ensure provider ledger account exists
-------------------------------------------------------- */
export const getOrCreateProviderLedgerAccount = async ({
  providerId,
  currency = HELP_IO_CURRENCY,
}) => {
  if (!providerId) throw new Error("providerId is required");

  const normalizedCurrency = normalizeCurrency(currency);

  let account = await LedgerAccount.findOne({
    provider: providerId,
    accountType: "provider",
    currency: normalizedCurrency,
  });

  if (!account) {
    account = await LedgerAccount.create({
      provider: providerId,
      accountType: "provider",
      currency: normalizedCurrency,
    });
  }

  return account;
};

/* -------------------------------------------------------
   Internal: Apply a ledger entry to account buckets
-------------------------------------------------------- */
const applyEntryToAccountBuckets = (account, entry) => {
  const sign = entry.direction === "credit" ? 1 : -1;
  const delta = sign * entry.amountCents;

  // Net balance
  account.currentBalanceCents += delta;

  // Bucket logic
  if (entry.status === "pending") {
    account.pendingCents += delta;
  } else if (entry.status === "available") {
    account.availableCents += delta;
  } else if (entry.status === "on_hold") {
    account.onHoldCents += delta;
  } else if (entry.status === "paid_out") {
    account.paidOutCents += delta;
    account.availableCents += delta; // payouts usually reduce available
  }
};

/* -------------------------------------------------------
   CHARGE: new money from a customer (T+7 pending → available)
-------------------------------------------------------- */
export const recordProviderCharge = async ({
  providerId,
  amount, // in dollars
  currency = HELP_IO_CURRENCY,
  availableDelayDays = 7, // settlement window
  stripePaymentIntentId,
  stripeChargeId,
  invoiceId,
  subscriptionId,
  subscriptionChargeId,
  metadata = {},
}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const account = await getOrCreateProviderLedgerAccount({
      providerId,
      currency,
    });

    const amountCents = toCents(amount);
    const now = new Date();
    const availableAt = new Date(
      now.getTime() + availableDelayDays * 24 * 60 * 60 * 1000
    );

    const entry = await LedgerEntry.create(
      [
        {
          ledgerAccount: account._id,
          provider: providerId,
          entryType: "charge",
          direction: "credit",
          amountCents,
          currency: normalizeCurrency(currency),
          status: "pending",
          availableAt,
          stripePaymentIntentId: stripePaymentIntentId || undefined,
          stripeChargeId: stripeChargeId || undefined,
          invoice: invoiceId || undefined,
          subscription: subscriptionId || undefined,
          subscriptionCharge: subscriptionChargeId || undefined,
          metadata,
        },
      ],
      { session }
    );

    applyEntryToAccountBuckets(account, entry[0]);
    await account.save({ session });

    await session.commitTransaction();
    session.endSession();

    return entry[0];
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};

/* -------------------------------------------------------
   REFUND: money going back to the customer
-------------------------------------------------------- */
export const recordProviderRefund = async ({
  providerId,
  amount, // in dollars (partial or full)
  currency = HELP_IO_CURRENCY,
  stripeRefundId,
  stripeChargeId,
  invoiceId,
  subscriptionId,
  metadata = {},
}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const account = await getOrCreateProviderLedgerAccount({
      providerId,
      currency,
    });

    const amountCents = toCents(amount);
    const entry = await LedgerEntry.create(
      [
        {
          ledgerAccount: account._id,
          provider: providerId,
          entryType: "refund",
          direction: "debit",
          amountCents,
          currency: normalizeCurrency(currency),
          status: "available", // refund immediately affects available/net
          stripeRefundId: stripeRefundId || undefined,
          stripeChargeId: stripeChargeId || undefined,
          invoice: invoiceId || undefined,
          subscription: subscriptionId || undefined,
          metadata,
        },
      ],
      { session }
    );

    applyEntryToAccountBuckets(account, entry[0]);
    await account.save({ session });

    await session.commitTransaction();
    session.endSession();

    return entry[0];
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};

/* -------------------------------------------------------
   DISPUTE HOLD: move funds to "on_hold"
-------------------------------------------------------- */
export const placeDisputeHold = async ({
  providerId,
  amount, // dollars
  currency = HELP_IO_CURRENCY,
  disputeId,
  metadata = {},
}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const account = await getOrCreateProviderLedgerAccount({
      providerId,
      currency,
    });

    const amountCents = toCents(amount);

    const entry = await LedgerEntry.create(
      [
        {
          ledgerAccount: account._id,
          provider: providerId,
          entryType: "dispute_hold",
          direction: "debit", // debit available
          amountCents,
          currency: normalizeCurrency(currency),
          status: "on_hold",
          disputeId: disputeId || undefined,
          metadata,
        },
      ],
      { session }
    );

    applyEntryToAccountBuckets(account, entry[0]);
    await account.save({ session });

    await session.commitTransaction();
    session.endSession();

    return entry[0];
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};

/* -------------------------------------------------------
   DISPUTE RELEASE: release funds back to available
-------------------------------------------------------- */
export const releaseDisputeHold = async ({
  providerId,
  amount, // dollars
  currency = HELP_IO_CURRENCY,
  disputeId,
  metadata = {},
}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const account = await getOrCreateProviderLedgerAccount({
      providerId,
      currency,
    });

    const amountCents = toCents(amount);

    const entry = await LedgerEntry.create(
      [
        {
          ledgerAccount: account._id,
          provider: providerId,
          entryType: "dispute_release",
          direction: "credit", // credit back to available
          amountCents,
          currency: normalizeCurrency(currency),
          status: "available",
          disputeId: disputeId || undefined,
          metadata,
        },
      ],
      { session }
    );

    applyEntryToAccountBuckets(account, entry[0]);
    await account.save({ session });

    await session.commitTransaction();
    session.endSession();

    return entry[0];
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};

/* -------------------------------------------------------
   SETTLEMENT CRON (T+7 ➜ available)
   - Run every hour or daily
-------------------------------------------------------- */
export const runSettlementCron = async () => {
  const now = new Date();
  console.log("🕒 Running Ledger Settlement Cron at", now.toISOString());

  const cursor = LedgerEntry.find({
    status: "pending",
    availableAt: { $lte: now },
  }).cursor();

  for (let entry = await cursor.next(); entry != null; entry = await cursor.next()) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const account = await LedgerAccount.findById(entry.ledgerAccount).session(
        session
      );
      if (!account) {
        console.warn(
          "⚠️ Settlement: ledger account not found for entry",
          entry._id
        );
        await session.abortTransaction();
        session.endSession();
        continue;
      }

      // Reverse old bucket effect
      const sign = entry.direction === "credit" ? 1 : -1;
      const delta = sign * entry.amountCents;

      account.pendingCents -= delta; // remove from pending
      account.availableCents += delta; // move to available
      entry.status = "available";

      await entry.save({ session });
      await account.save({ session });

      await session.commitTransaction();
      session.endSession();
    } catch (err) {
      console.error("❌ Settlement cron error:", err);
      await session.abortTransaction();
      session.endSession();
    }
  }

  console.log("✅ Ledger Settlement Cron finished.\n");
};

/* -------------------------------------------------------
   UI-Friendly Balance Aggregations
-------------------------------------------------------- */
export const getProviderLedgerSummary = async ({ providerId, currency }) => {
  const account = await LedgerAccount.findOne({
    provider: providerId,
    accountType: "provider",
    currency: normalizeCurrency(currency || HELP_IO_CURRENCY),
  });

  if (!account) {
    return {
      balanceCents: 0,
      pendingCents: 0,
      availableCents: 0,
      onHoldCents: 0,
      paidOutCents: 0,
    };
  }

  return {
    balanceCents: account.currentBalanceCents,
    pendingCents: account.pendingCents,
    availableCents: account.availableCents,
    onHoldCents: account.onHoldCents,
    paidOutCents: account.paidOutCents,
  };
};
