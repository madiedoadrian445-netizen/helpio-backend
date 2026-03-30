import TerminalPayment from "../models/TerminalPayment.js";
import Provider from "../models/Provider.js";

import Invoice from "../models/Invoice.js";
import Customer from "../models/Customer.js";
import LedgerEntry from "../models/LedgerEntry.js";




export const getProviderAnalytics = async (req, res) => {
  try {

const provider = await Provider.findOne({ user: req.user._id }).select("_id");

    if (!provider) {
      return res.status(401).json({
        success: false,
        message: "Provider not found"
      });
    }

    const now = new Date();

    const todayStart = new Date();
    todayStart.setHours(0,0,0,0);

    const last30Start = new Date();
    last30Start.setDate(now.getDate() - 30);

    const previous30Start = new Date();
    previous30Start.setDate(now.getDate() - 60);

    /* ---------------------------
       SALES TODAY
    --------------------------- */

    const salesTodayAgg = await TerminalPayment.aggregate([
      {
        $match: {
          provider: provider._id,
          status: "captured",
          createdAt: { $gte: todayStart }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amountCapturedCents" },
          count: { $sum: 1 }
        }
      }
    ]);

    const salesToday = salesTodayAgg[0]?.total || 0;
  const transactionsToday = salesTodayAgg[0]?.count || 0;



    /* ---------------------------
       LAST 30 DAYS SALES
    --------------------------- */

    const last30Agg = await TerminalPayment.aggregate([
      {
        $match: {
          provider: provider._id,
          status: "captured",
          createdAt: { $gte: last30Start }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amountCapturedCents" }
        }
      }
    ]);

    const totalLast30Days = last30Agg[0]?.total || 0;

    /* ---------------------------
       PREVIOUS 30 DAYS
    --------------------------- */

    const prev30Agg = await TerminalPayment.aggregate([
      {
        $match: {
          provider: provider._id,
          status: "captured",
          createdAt: {
            $gte: previous30Start,
            $lt: last30Start
          }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amountCapturedCents" }
        }
      }
    ]);

    const prev30 = prev30Agg[0]?.total || 0;

    const previous30DaysGrowth =
      prev30 === 0
        ? 100
        : Math.round(((totalLast30Days - prev30) / prev30) * 100);

/* ---------------------------
   BAR CHART DATA (14 days)
--------------------------- */

const last14Start = new Date();
last14Start.setDate(now.getDate() - 13);
last14Start.setHours(0, 0, 0, 0);

const revenueAgg = await TerminalPayment.aggregate([
  {
    $match: {
      provider: provider._id,
      status: "captured",
      createdAt: { $gte: last14Start }
    }
  },
  {
    $group: {
      _id: {
        day: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$createdAt",
            timezone: "America/New_York"
          }
        }
      },
      total: { $sum: "$amountCapturedCents" }
    }
  },
  { $sort: { "_id.day": 1 } }
]);

// Map existing days
const revenueMap = {};
revenueAgg.forEach(d => {
  revenueMap[d._id.day] = Math.round(d.total / 100);
});

// Build FULL 14-day timeline (fills missing days)
const revenueData = [];

for (let i = 13; i >= 0; i--) {
  const date = new Date(now);
  date.setDate(now.getDate() - i);

  const key = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
}).format(date).replace(/\//g, "-");

  revenueData.push({
    date: key,
    value: revenueMap[key] || 0
  });
}



/* ---------------------------
   CORE BUSINESS METRICS
--------------------------- */

const [
  invoicesToday,
  totalInvoices,
  totalTransactions,
  totalClients
] = await Promise.all([
  Invoice.countDocuments({
    provider: provider._id,
    createdAt: { $gte: todayStart },
  }),

  Invoice.countDocuments({
    provider: provider._id,
  }),

  LedgerEntry.countDocuments({
    provider: provider._id,
    direction: "credit",
    status: "posted",
    type: { $in: ["charge", "terminal_charge"] },
  }),

  Customer.countDocuments({
    provider: provider._id,
  }),
]);

    return res.json({
      success: true,
      analytics: {
        salesToday: Math.round(salesToday / 100),
        transactionsToday,
        invoicesToday,
        subscriptions: 0,
        totalLast30Days: Math.round(totalLast30Days / 100),
        previous30DaysGrowth,
        lastYearGrowth: 0,
        revenueData,
        totalInvoices,
        totalTransactions,
        totalClients,
      }
      });

  } catch (err) {

    console.error("Analytics error:", err);

    res.status(500).json({
      success: false,
      message: "Failed to load analytics"
    });

  }
};