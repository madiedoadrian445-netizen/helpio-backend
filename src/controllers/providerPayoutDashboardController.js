// src/controllers/providerPayoutDashboardController.js
import ProviderBalance from "../models/ProviderBalance.js";
import LedgerEntry from "../models/LedgerEntry.js";
import Payout from "../models/Payout.js";

/* ---------------------------------------------------------
   GET /api/payouts/dashboard/summary
   → Returns provider's financial overview
--------------------------------------------------------- */
export const getProviderDashboardSummary = async (req, res, next) => {
  try {
    const providerId = req.user.providerId;

    if (!providerId) {
      return res.status(400).json({
        success: false,
        message: "Provider profile not found",
      });
    }

    const balance = await ProviderBalance.findOne({ provider: providerId });

    return res.json({
      success: true,
      summary: {
        available: balance?.available ?? 0,
        pending: balance?.pending ?? 0,
        totalEarned: balance?.totalEarned ?? 0,
        lastUpdated: balance?.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

/* ---------------------------------------------------------
   GET /api/payouts/dashboard/graph
   → Returns last 30 days of revenue for graph charts
--------------------------------------------------------- */
export const getProviderDashboardGraph = async (req, res, next) => {
  try {
    const providerId = req.user.providerId;

    // Fetch last 30 days of ledger data
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const entries = await LedgerEntry.find({
      provider: providerId,
      createdAt: { $gte: since },
      type: "credit",
    })
      .sort({ createdAt: 1 })
      .lean();

    // Format graph data
    const graph = entries.map((e) => ({
      date: e.createdAt,
      amount: e.amount,
      description: e.description,
    }));

    return res.json({
      success: true,
      graph,
    });
  } catch (err) {
    next(err);
  }
};

/* ---------------------------------------------------------
   GET /api/payouts/dashboard/recent
   → Returns recent payouts for provider
--------------------------------------------------------- */
export const getProviderRecentPayouts = async (req, res, next) => {
  try {
    const providerId = req.user.providerId;

    const payouts = await Payout.find({ provider: providerId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    return res.json({
      success: true,
      payouts,
    });
  } catch (err) {
    next(err);
  }
};
