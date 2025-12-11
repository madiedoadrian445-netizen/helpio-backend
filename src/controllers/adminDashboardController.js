// src/controllers/adminDashboardController.js
import { getRevenueSummaryForRange } from "../utils/revenueAnalytics.js";
import { getTaxSummaryForRange } from "../utils/taxAnalytics.js";
import { mergeCronStatuses } from "../utils/cronHealth.js";

// ✅ FIXED IMPORTS — all models now imported correctly using DEFAULT exports
import CronJobStatus from "../models/CronJobStatus.js";
import FraudEvent from "../models/FraudEvent.js";
import LedgerEntry from "../models/LedgerEntry.js";
import Provider from "../models/Provider.js";
import Customer from "../models/Customer.js";
import Subscription from "../models/Subscription.js";
import Invoice from "../models/Invoice.js";
import Payout from "../models/Payout.js";

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

const ensureAdmin = (user) => {
  if (!user || !user.isAdmin) {
    const err = new Error("Admin access required");
    err.statusCode = 403;
    throw err;
  }
};

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

/**
 * GET /api/admin/dashboard
 */
export const getAdminDashboard = async (req, res) => {
  try {
    ensureAdmin(req.user);

    const currency = (req.query.currency || "usd").toLowerCase();
    const now = new Date();
    const last30Start = daysAgo(30);
    const last7Start = daysAgo(7);

    const [
      revenueLast30,
      taxLast30,
      providerCount,
      customerCount,
      subscriptionCount,
      invoiceCount,
      payoutCount,
      ledgerCountsAgg,
      fraudAgg,
      cronStatusesRaw,
    ] = await Promise.all([
      getRevenueSummaryForRange({ start: last30Start, end: now, currency }),
      getTaxSummaryForRange({ start: last30Start, end: now, currency }),

      Provider.countDocuments({}),
      Customer.countDocuments({}),
      Subscription.countDocuments({}),
      Invoice.countDocuments({}),
      Payout.countDocuments({}),

      LedgerEntry.aggregate([
        {
          $match: {
            effectiveAt: { $gte: last30Start, $lt: now },
            currency,
          },
        },
        {
          $group: {
            _id: "$type",
            count: { $sum: 1 },
          },
        },
      ]),

      FraudEvent.aggregate([
        {
          $match: {
            createdAt: { $gte: last7Start, $lt: now },
          },
        },
        {
          $facet: {
            byDecision: [
              {
                $group: {
                  _id: "$decision",
                  count: { $sum: 1 },
                },
              },
            ],
            byScoreBucket: [
              {
                $bucket: {
                  groupBy: "$score",
                  boundaries: [0, 20, 40, 60, 80, 200],
                  default: "80+",
                  output: { count: { $sum: 1 } },
                },
              },
            ],
            total: [
              {
                $group: {
                  _id: null,
                  count: { $sum: 1 },
                },
              },
            ],
          },
        },
      ]),

      CronJobStatus.find({}).lean(),
    ]);

    const ledgerTypeCounts = ledgerCountsAgg.reduce((acc, row) => {
      acc[row._id] = row.count;
      return acc;
    }, {});

    const fraudStats = fraudAgg[0] || {
      byDecision: [],
      byScoreBucket: [],
      total: [],
    };

    const cronMerged = mergeCronStatuses(cronStatusesRaw || []);
    const unhealthyCrons = cronMerged.filter(
      (j) => j.lastStatus === "error"
    ).length;

    return res.json({
      success: true,
      asOf: now,
      currency,
      rangeLast30d: { start: last30Start, end: now },

      revenue: { ...revenueLast30.metrics },
      tax: { ...taxLast30.totals },

      counts: {
        providers: providerCount,
        customers: customerCount,
        subscriptions: subscriptionCount,
        invoices: invoiceCount,
        payouts: payoutCount,
      },

      ledgerActivity: {
        totalCharges: ledgerTypeCounts.charge || 0,
        totalRefunds: ledgerTypeCounts.refund || 0,
        totalDisputes: ledgerTypeCounts.dispute || 0,
        totalFees: ledgerTypeCounts.fee || 0,
      },

      fraud: {
        totalEvents: fraudStats.total[0]?.count || 0,
        byDecision: fraudStats.byDecision,
        byScoreBucket: fraudStats.byScoreBucket,
        rangeLast7d: { start: last7Start, end: now },
      },

      cron: {
        jobs: cronMerged,
        unhealthyCount: unhealthyCrons,
      },
    });
  } catch (err) {
    console.error("getAdminDashboard error:", err);
    if (err.statusCode === 403) {
      return sendError(res, 403, "Admin access required");
    }
    return sendError(res, 500, "Failed to load admin dashboard");
  }
};
