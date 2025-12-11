// src/controllers/payoutController.js

import mongoose from "mongoose";
import ProviderBalance from "../models/ProviderBalance.js";
import LedgerEntry from "../models/LedgerEntry.js";
import Provider from "../models/Provider.js";
import Payout from "../models/Payout.js";

import {
  reserveIdempotencyKey,
  markIdempotencyKeyCompleted,
  markIdempotencyKeyFailed,
} from "../utils/idempotency.js";

/* ===========================================================
   HELPERS
=========================================================== */

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

const normalizeCurrency = (currency) => {
  if (!currency || typeof currency !== "string") return "usd";
  return currency.toLowerCase();
};

const parseAmountDollarsToCents = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n * 100);
};

const getProviderForUser = async (userId) => {
  if (!userId) return null;
  // Only need _id for scoping here
  return Provider.findOne({ user: userId }).select("_id").lean();
};

const buildPayoutBatchId = () =>
  `payout_${new Date().toISOString().replace(/[:.]/g, "-")}`;

const getPagination = (req) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

// Small helper for analytics ranges
const getRangeDaysFromQuery = (req, defaultDays = 30, maxDays = 365) => {
  const raw = parseInt(req.query.rangeDays, 10);
  if (!Number.isFinite(raw) || raw <= 0) return defaultDays;
  return Math.min(raw, maxDays);
};

/* ===========================================================
   REQUEST PAYOUT  (Simulated / Manual Processor)
=========================================================== */
/**
 * POST /api/payouts/request
 * Body: { amountDollars, currency?, idempotencyKey }
 *
 * - Provider-scoped
 * - Uses ProviderBalance.available
 * - Idempotent via idempotencyKey
 * - Currently: simulated/manual (no external processor yet)
 * - Writes:
 *    - LedgerEntry (type: "payout", amount in cents)
 *    - Payout model (amount/netAmount in cents)
 */
export const requestPayout = async (req, res) => {
  try {
    let { amountDollars, currency = "usd", idempotencyKey } = req.body;

    if (!idempotencyKey) {
      return sendError(res, 400, "idempotencyKey required.");
    }

    const provider = await getProviderForUser(req.user?._id);
    if (!provider) {
      return sendError(res, 404, "Provider not found.");
    }

    currency = normalizeCurrency(currency);
    const amountCents = parseAmountDollarsToCents(amountDollars);

    if (!amountCents || amountCents <= 0) {
      return sendError(res, 400, "Invalid payout amount.");
    }

    // Quick pre-check outside of transaction
    let balance = await ProviderBalance.findOne({
      provider: provider._id,
      currency,
    });

    if (!balance) {
      return sendError(res, 404, "Balance not found for this currency.");
    }

    if (balance.available < amountCents) {
      return sendError(res, 400, "Insufficient available balance.");
    }

    /* ----------------------------------------------
       IDEMPOTENCY RESERVE
    ----------------------------------------------- */
    let idem;
    try {
      idem = await reserveIdempotencyKey({
        key: idempotencyKey,
        type: "payout_request",
        amount: amountCents,
        currency,
        providerId: provider._id,
        initiatedBy: "provider",
        payloadForHash: {
          providerId: provider._id.toString(),
          amountCents,
          currency,
        },
        extraContext: { route: "requestPayout" },
      });
    } catch (err) {
      return sendError(res, 400, err.message);
    }

    if (idem.status === "existing_completed") {
      return res.json({
        success: true,
        replay: true,
        message: "Payout already completed.",
      });
    }

    if (idem.status === "existing_in_progress") {
      return sendError(res, 409, "Payout already in progress.");
    }

    if (idem.status === "existing_failed") {
      return sendError(
        res,
        409,
        "Previous payout attempt failed. Use a new idempotency key."
      );
    }

    const idemId = idem.record._id;

    /* ----------------------------------------------
       PROCESS PAYOUT (SIMULATED / MANUAL)
       - Atomic via MongoDB transaction
    ----------------------------------------------- */
    const session = await mongoose.startSession();
    session.startTransaction();

    let payoutDoc = null;

    try {
      // Re-load balance inside the transaction to avoid races
      balance = await ProviderBalance.findOne({
        provider: provider._id,
        currency,
      }).session(session);

      if (!balance) {
        throw new Error("BALANCE_NOT_FOUND");
      }

      if (balance.available < amountCents) {
        throw new Error("INSUFFICIENT_FUNDS");
      }

      const batchId = buildPayoutBatchId();

      // Debit the available balance
      balance.available -= amountCents;
      // Keep safety: total = available + pending - reserved, non-negative
      balance.total = Math.max(
        0,
        (balance.available || 0) +
          (balance.pending || 0) -
          (balance.reserved || 0)
      );
      balance.lastRecalculatedAt = new Date();

      await balance.save({ session });

      // Ledger entry for payout (amount in cents)
      const [ledger] = await LedgerEntry.create(
        [
          {
            provider: provider._id,
            type: "payout",
            direction: "debit",
            amount: amountCents,
            currency,
            sourceType: "payout",
            status: "posted",
            effectiveAt: new Date(),
            availableAt: new Date(),
            createdBy: "provider",
            metadata: {
              payoutBatchId: batchId,
              brand: "Helpio Pay",
              helpioPayout: true,
              method: "manual_or_simulated",
              origin: "provider_request",
            },
          },
        ],
        { session }
      );

      // Payout record (amounts stored in cents to stay consistent)
      const payoutData = {
        provider: provider._id,
        amount: amountCents,
        netAmount: amountCents,
        payoutFee: 0,
        taxWithheld: 0,
        currency,
        status: "pending",
        settlementDate: new Date(),
        method: "manual",
        arrivalDate: null,
        description: "Provider-initiated payout request (Helpio Pay).",
        stripePayoutId: null,
        stripeBalanceTransactionId: null,
        failureReason: null,
        attemptCount: 0,
        lastAttemptAt: null,
        lockedAt: null,
        reversalReason: null,
        ledgerEntry: ledger._id,
        approvedBy: null,
        rejectedBy: null,
        notes: null,
        metadata: {
          payoutBatchId: batchId,
          origin: "provider_request",
          idempotencyKey,
        },
        createdBy: "provider",
      };

      const [payoutCreated] = await Payout.create([payoutData], { session });
      payoutDoc = payoutCreated;

      await session.commitTransaction();
      session.endSession();

      await markIdempotencyKeyCompleted(idemId, {
        payoutId: payoutDoc._id,
        ledgerEntryId: ledger._id,
        extraContext: { batchId },
      });

      return res.json({
        success: true,
        message: "Payout request successful.",
        // Backward compatible: keep `payout` as the ledger entry
        payout: ledger,
        // New: explicit payout record based on Payout model
        payoutRecord: payoutDoc,
        providerBalance: balance,
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();

      // Business errors → mark idempotency failed but return clear message
      if (err.message === "BALANCE_NOT_FOUND") {
        await markIdempotencyKeyFailed(idemId, {
          extraContext: { error: "BALANCE_NOT_FOUND" },
        });
        return sendError(
          res,
          404,
          "Balance not found while processing payout."
        );
      }

      if (err.message === "INSUFFICIENT_FUNDS") {
        await markIdempotencyKeyFailed(idemId, {
          extraContext: { error: "INSUFFICIENT_FUNDS" },
        });
        return sendError(
          res,
          400,
          "Insufficient available balance at time of payout."
        );
      }

      await markIdempotencyKeyFailed(idemId, {
        extraContext: { error: err.message || "unknown_error" },
      });

      console.error("❌ requestPayout transactional error:", err);
      return sendError(res, 500, "Payout failed due to a server error.");
    }
  } catch (err) {
    console.error("❌ requestPayout error:", err);
    return sendError(res, 500, "Server error.");
  }
};

/* ===========================================================
   GET PAYOUT HISTORY (Paginated)
=========================================================== */
/**
 * GET /api/payouts/history
 * Query: page?, limit?, currency?, startDate?, endDate?
 *
 * NOTE:
 *  - Uses LedgerEntry (type = "payout") as the source of truth
 *  - Payout model is linked via ledgerEntry if you need extra data later
 */
export const getPayoutHistory = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    if (!provider) {
      return sendError(res, 404, "Provider not found.");
    }

    const { page, limit, skip } = getPagination(req);

    const filter = {
      provider: provider._id,
      type: "payout",
    };

    if (req.query.currency) {
      filter.currency = normalizeCurrency(req.query.currency);
    }

    if (req.query.startDate || req.query.endDate) {
      filter.effectiveAt = {};
      if (req.query.startDate)
        filter.effectiveAt.$gte = new Date(req.query.startDate);
      if (req.query.endDate)
        filter.effectiveAt.$lte = new Date(req.query.endDate);
    }

    const [payouts, total] = await Promise.all([
      LedgerEntry.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      LedgerEntry.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      payouts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    console.error("❌ getPayoutHistory error:", err);
    return sendError(res, 500, "Server error.");
  }
};

/* ===========================================================
   GET CURRENT BALANCE(S)
=========================================================== */
/**
 * GET /api/payouts/balance
 * - Returns all currency balances for this provider
 */
export const getMyBalance = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    if (!provider) {
      return sendError(res, 404, "Provider not found.");
    }

    const balances = await ProviderBalance.find({
      provider: provider._id,
    })
      .sort({ currency: 1 })
      .lean();

    return res.json({ success: true, balances });
  } catch (err) {
    console.error("❌ getMyBalance error:", err);
    return sendError(res, 500, "Server error.");
  }
};

/* ===========================================================
   B18-F – PROVIDER PAYOUT DASHBOARD SUMMARY
=========================================================== */
/**
 * GET /api/payouts/dashboard
 *
 * Returns:
 *  - balances: ProviderBalance docs
 *  - lastPayout: last Payout row for this provider
 *  - lifetimePayouts: { totalAmountCents, count }
 *  - last30Days: { totalAmountCents, count, since }
 *  - nextAutoPayoutEstimate: per-currency estimate based on available
 */
export const getPayoutDashboard = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    if (!provider) {
      return sendError(res, 404, "Provider not found.");
    }

    const providerId = provider._id;

    // 1️⃣ Balances
    const balances = await ProviderBalance.find({
      provider: providerId,
    })
      .sort({ currency: 1 })
      .lean();

    // 2️⃣ Last Payout from Payout model
    const lastPayout = await Payout.findOne({ provider: providerId })
      .sort({ createdAt: -1 })
      .lean();

    // 3️⃣ Lifetime payouts via LedgerEntry (type = "payout")
    const [lifetimeAgg] = await LedgerEntry.aggregate([
      {
        $match: {
          provider: providerId,
          type: "payout",
        },
      },
      {
        $group: {
          _id: null,
          totalAmountCents: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    const lifetimePayouts = {
      totalAmountCents: lifetimeAgg?.totalAmountCents || 0,
      count: lifetimeAgg?.count || 0,
    };

    // 4️⃣ Last 30 days payouts (for quick dashboard stat)
    const days = 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [last30Agg] = await LedgerEntry.aggregate([
      {
        $match: {
          provider: providerId,
          type: "payout",
          effectiveAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: null,
          totalAmountCents: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    const last30Days = {
      since,
      totalAmountCents: last30Agg?.totalAmountCents || 0,
      count: last30Agg?.count || 0,
    };

    // 5️⃣ Next auto payout estimate per currency
    //     (your autoPayoutCron pays out full `available` if >= MIN_PAYOUT_CENTS).
    const nextAutoPayoutEstimate = balances.map((b) => ({
      currency: b.currency,
      availableCents: b.available || 0,
    }));

    return res.json({
      success: true,
      dashboard: {
        balances,
        lastPayout,
        lifetimePayouts,
        last30Days,
        nextAutoPayoutEstimate,
      },
    });
  } catch (err) {
    console.error("❌ getPayoutDashboard error:", err);
    return sendError(res, 500, "Server error.");
  }
};

/* ===========================================================
   B18-F – PROVIDER PAYOUT ANALYTICS (Chart Data)
=========================================================== */
/**
 * GET /api/payouts/analytics?rangeDays=30
 *
 * Returns chart-friendly data:
 *  - daily: [{ date: 'YYYY-MM-DD', totalAmountCents, count }]
 *  - summary: { rangeDays, from, to, totalAmountCents, count }
 */
export const getPayoutAnalytics = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    if (!provider) {
      return sendError(res, 404, "Provider not found.");
    }

    const providerId = provider._id;
    const rangeDays = getRangeDaysFromQuery(req, 30, 365);

    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - rangeDays);

    const matchStage = {
      provider: providerId,
      type: "payout",
      effectiveAt: { $gte: from, $lte: to },
    };

    // Aggregate by day
    const dailyAgg = await LedgerEntry.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$effectiveAt" },
          },
          totalAmountCents: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const daily = dailyAgg.map((row) => ({
      date: row._id,
      totalAmountCents: row.totalAmountCents,
      count: row.count,
    }));

    const summaryTotals = daily.reduce(
      (acc, d) => {
        acc.totalAmountCents += d.totalAmountCents;
        acc.count += d.count;
        return acc;
      },
      { totalAmountCents: 0, count: 0 }
    );

    return res.json({
      success: true,
      analytics: {
        rangeDays,
        from,
        to,
        summary: summaryTotals,
        daily,
      },
    });
  } catch (err) {
    console.error("❌ getPayoutAnalytics error:", err);
    return sendError(res, 500, "Server error.");
  }
};
