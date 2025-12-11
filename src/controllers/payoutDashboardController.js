// src/controllers/providerPayoutDashboardController.js

import Provider from "../models/Provider.js";
import ProviderBalance from "../models/ProviderBalance.js";
import LedgerEntry from "../models/LedgerEntry.js";
import Payout from "../models/Payout.js";

/* ===========================================================
   HELPERS
=========================================================== */

const normalizeCurrency = (c) =>
  typeof c === "string" ? c.toLowerCase() : "usd";

const getProviderForUser = async (userId) => {
  if (!userId) return null;
  return Provider.findOne({ user: userId }).select("_id").lean();
};

const sendError = (res, status, msg) =>
  res.status(status).json({ success: false, message: msg });

/* ===========================================================
   B18-G.1 — PROVIDER DASHBOARD SUMMARY
   GET /api/payouts/dashboard/summary
=========================================================== */
export const getProviderDashboardSummary = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 404, "Provider not found.");

    const currency = normalizeCurrency(req.query.currency || "usd");

    // Load balance row
    const balance = await ProviderBalance.findOne({
      provider: provider._id,
      currency,
    }).lean();

    // Lifetime payout totals
    const lifetimeAgg = await LedgerEntry.aggregate([
      {
        $match: {
          provider: provider._id,
          type: "payout",
          currency,
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    // Last payout
    const last = await LedgerEntry.findOne({
      provider: provider._id,
      type: "payout",
      currency,
    })
      .sort({ createdAt: -1 })
      .select("amount createdAt")
      .lean();

    // Pending payouts (from Payout model)
    const pendingCount = await Payout.countDocuments({
      provider: provider._id,
      status: { $in: ["pending", "processing"] },
      currency,
    });

    return res.json({
      success: true,
      data: {
        available: balance?.available ?? 0,
        pending: balance?.pending ?? 0,
        reserved: balance?.reserved ?? 0,

        lifetimePayoutAmount: lifetimeAgg[0]?.total ?? 0,
        lifetimePayoutCount: lifetimeAgg[0]?.count ?? 0,

        lastPayout: last || null,
        pendingPayouts: pendingCount,
      },
    });
  } catch (err) {
    console.error("❌ getProviderDashboardSummary error:", err);
    return sendError(res, 500, "Server error.");
  }
};

/* ===========================================================
   B18-G.2 — PROVIDER CHART API (daily payout totals)
   GET /api/payouts/dashboard/graph?range=30d|90d|1y
=========================================================== */
export const getProviderDashboardGraph = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 404, "Provider not found.");

    const currency = normalizeCurrency(req.query.currency || "usd");
    const range = req.query.range || "30d";

    const days =
      range === "90d" ? 90 :
      range === "1y" ? 365 :
      30;

    const since = new Date(Date.now() - days * 24 * 3600 * 1000);

    const agg = await LedgerEntry.aggregate([
      {
        $match: {
          provider: provider._id,
          type: "payout",
          currency,
          createdAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: {
            y: { $year: "$createdAt" },
            m: { $month: "$createdAt" },
            d: { $dayOfMonth: "$createdAt" },
          },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          date: {
            $dateFromParts: {
              year: "$_id.y",
              month: "$_id.m",
              day: "$_id.d",
            },
          },
          total: 1,
          count: 1,
          _id: 0,
        },
      },
      { $sort: { date: 1 } },
    ]);

    return res.json({
      success: true,
      range,
      data: agg,
    });
  } catch (err) {
    console.error("❌ getProviderDashboardGraph error:", err);
    return sendError(res, 500, "Server error.");
  }
};

/* ===========================================================
   B18-G.3 — RECENT PAYOUT ACTIVITY
   GET /api/payouts/dashboard/recent
=========================================================== */
export const getProviderRecentPayouts = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 404, "Provider not found.");

    const currency = normalizeCurrency(req.query.currency || "usd");

    const payouts = await Payout.find({
      provider: provider._id,
      currency,
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    return res.json({
      success: true,
      payouts,
    });
  } catch (err) {
    console.error("❌ getProviderRecentPayouts error:", err);
    return sendError(res, 500, "Server error.");
  }
};
