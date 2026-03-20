import TerminalPayment from "../models/TerminalPayment.js";
import Provider from "../models/Provider.js";

export const getProviderAnalytics = async (req, res) => {
  try {

    const provider = await Provider.findOne({ user: req.user._id });

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
    const invoicesToday = salesTodayAgg[0]?.count || 0;

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
       BAR CHART DATA (12 days)
    --------------------------- */

  const last12Start = new Date();
last12Start.setDate(now.getDate() - 11);
last12Start.setHours(0, 0, 0, 0);

const revenueAgg = await TerminalPayment.aggregate([
  {
    $match: {
      provider: provider._id,
      status: "captured",
      createdAt: { $gte: last12Start }
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
// Build map of existing days
const revenueMap = {};
revenueAgg.forEach(d => {
  revenueMap[d._id.day] = Math.round(d.total / 100);
});

// Build full 12-day timeline (fills missing days with 0)
const revenueData = [];

for (let i = 11; i >= 0; i--) {
 
  
  
  const date = new Date(now);
date.setDate(now.getDate() - i);
date.setHours(0, 0, 0, 0);



const key = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(date);

  revenueData.push({
    date: key,
    value: revenueMap[key] || 0
  });
}
    return res.json({
      success: true,
      analytics: {
        salesToday: Math.round(salesToday / 100),
        invoicesToday,
        subscriptions: 0,
        totalLast30Days: Math.round(totalLast30Days / 100),
        previous30DaysGrowth,
        lastYearGrowth: 0,
        revenueData
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