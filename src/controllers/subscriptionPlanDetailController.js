// controllers/subscriptionPlanDetailController.js
import Subscription from "../models/Subscription.js";
import SubscriptionPlan from "../models/SubscriptionPlan.js";
import SubscriptionCharge from "../models/SubscriptionCharge.js";

export const getSubscriptionPlanDetails = async (req, res) => {
  try {
    const providerId = req.user._id;
    const { id } = req.params;

    const plan = await SubscriptionPlan.findOne({
      _id: id,
      provider: providerId,
    });

    if (!plan) {
      return res.status(404).json({ success: false, message: "Plan not found" });
    }

    // Get all subscriptions under this plan
    const subs = await Subscription.find({ plan: id }).populate("client");

    // Status counts for the UI
    const stats = {
      activeCount: subs.filter((s) => s.status === "active").length,
      pausedCount: subs.filter((s) => s.status === "paused").length,
      pastDueCount: subs.filter((s) => s.status === "past_due").length,
      canceledCount: subs.filter((s) => s.status === "canceled").length,
    };

    // Subscribers section
    const subscribers = subs.map((s) => ({
      id: s._id,
      name: s.client?.name || "Unknown",
      status: s.status,
      nextBilling: s.nextBillingDate,
      amount: s.price,
    }));

    // Upcoming charges = subscriptions whose nextBillingDate is due within X days
    const upcomingCharges = [
      {
        id: "coming_1",
        date: "Tomorrow",
        count: subs.filter((s) =>
          isTomorrow(s.nextBillingDate)
        ).length,
        total:
          subs
            .filter((s) => isTomorrow(s.nextBillingDate))
            .reduce((a, s) => a + s.price, 0),
      },
      {
        id: "coming_2",
        date: "Next 7 days",
        count: subs.filter((s) =>
          isWithin7Days(s.nextBillingDate)
        ).length,
        total:
          subs
            .filter((s) => isWithin7Days(s.nextBillingDate))
            .reduce((a, s) => a + s.price, 0),
      },
    ];

    // Activity = last 20 subscription events (charges, past due, canceled, etc.)
    const recentCharges = await SubscriptionCharge.find({
      plan: id,
    })
      .sort({ createdAt: -1 })
      .limit(20);

    const activity = recentCharges.map((c) => ({
      id: c._id,
      type:
        c.status === "paid"
          ? "new"
          : c.status === "failed"
          ? "past_due"
          : "canceled",
      label:
        c.status === "paid"
          ? "Successful charge"
          : c.status === "failed"
          ? "Failed charge"
          : "Refund",
      detail: `${c.amount} ${c.currency} • via ${c.method}`,
      time: c.createdAt,
    }));

    // MRR Calculation
    const mrr = stats.activeCount * plan.price;
    const arr = mrr * 12;

    return res.json({
      success: true,
      plan: {
        id: plan._id,
        name: plan.planName,
        price: plan.price,
        currency: plan.currency,
        interval: plan.billingFrequency,
        autoBilling: plan.autoBilling,
        ...stats,
        mrr,
        arr,
        reminderDays: plan?.reminder?.daysBefore || null,
        minCycles: plan.minCyclesLock?.minCycles || null,
        trial: plan.hasTrial ? plan.trial : null,
      },
      subscribers,
      upcomingCharges,
      activity,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Helpers
const isTomorrow = (date) => {
  if (!date) return false;
  const now = new Date();
  const target = new Date(date);
  const diff = target - now;
  return diff > 0 && diff < 1000 * 60 * 60 * 24 * 2; // within 48h
};

const isWithin7Days = (date) => {
  if (!date) return false;
  const now = new Date();
  const target = new Date(date);
  const diff = target - now;
  return diff > 0 && diff < 1000 * 60 * 60 * 24 * 7;
};
