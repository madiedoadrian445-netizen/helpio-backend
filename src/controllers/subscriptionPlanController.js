// ---------------------------------------------------------
// controllers/subscriptionPlanController.js (HARDENED B17)
// ---------------------------------------------------------
import mongoose from "mongoose";
import SubscriptionPlan from "../models/SubscriptionPlan.js";
import Subscription from "../models/Subscription.js";
import SubscriptionCharge from "../models/SubscriptionCharge.js";
import { Provider } from "../models/Provider.js";

/* -------------------------------------------------------
   UTILITIES
-------------------------------------------------------- */
const safeNumber = (val) => {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
};

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const isTomorrow = (date) => {
  if (!date) return false;
  const now = new Date();
  const t = new Date(date);
  return t > now && t - now < 48 * 60 * 60 * 1000;
};

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

/* Fields allowed when creating or updating a plan */
const PLAN_ALLOWED_FIELDS = [
  "planName",
  "description",
  "billingFrequency",
  "price",
  "currency",
  "autoBilling",
  "reminder",
  "minCyclesLock",
  "hasTrial",
  "trial",
];

/* -------------------------------------------------------
   Helper: get provider for logged-in user
-------------------------------------------------------- */
const getProviderForUser = async (userId) => {
  if (!userId) return null;
  return Provider.findOne({ user: userId });
};

/* -------------------------------------------------------
   CREATE PLAN
-------------------------------------------------------- */
export const createSubscriptionPlan = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);

    if (!provider) {
      return sendError(res, 401, "Provider profile not found");
    }

    const allowedFreq = ["weekly", "biweekly", "monthly", "yearly"];

    const data = { provider: provider._id };

    PLAN_ALLOWED_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) {
        data[field] = req.body[field];
      }
    });

    if (!data.planName || typeof data.planName !== "string") {
      return sendError(res, 400, "planName is required");
    }

    if (!data.billingFrequency || !allowedFreq.includes(data.billingFrequency)) {
      return sendError(res, 400, "Invalid billingFrequency");
    }

    if (data.price === undefined) {
      return sendError(res, 400, "price is required");
    }

    data.price = safeNumber(data.price);
    if (data.price <= 0) {
      return sendError(res, 400, "price must be greater than zero");
    }

    const plan = await SubscriptionPlan.create(data);

    return res.status(201).json({ success: true, plan });
  } catch (err) {
    console.log("❌ createSubscriptionPlan error:", err);
    return sendError(res, 500, "Failed to create plan");
  }
};

/* -------------------------------------------------------
   GET ALL PLANS FOR PROVIDER
-------------------------------------------------------- */
export const getMySubscriptionPlans = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);

    if (!provider) {
      return sendError(res, 401, "Provider profile not found");
    }

    const plans = await SubscriptionPlan.find({ provider: provider._id }).sort({
      createdAt: -1,
    });

    return res.json({ success: true, plans });
  } catch (err) {
    console.log("❌ getMySubscriptionPlans error:", err);
    return sendError(res, 500, "Failed to fetch plans");
  }
};

/* -------------------------------------------------------
   GET PLAN BY ID
-------------------------------------------------------- */
export const getSubscriptionPlanById = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    const planId = req.params.id;

    if (!provider) return sendError(res, 401, "Provider profile not found");
    if (!isValidId(planId)) return sendError(res, 400, "Invalid plan ID");

    const plan = await SubscriptionPlan.findOne({
      _id: planId,
      provider: provider._id,
    });

    if (!plan) return sendError(res, 404, "Plan not found");

    return res.json({ success: true, plan });
  } catch (err) {
    console.log("❌ getSubscriptionPlanById error:", err);
    return sendError(res, 500, "Failed to fetch plan");
  }
};

/* -------------------------------------------------------
   UPDATE PLAN (LOCKED IF SUBSCRIPTIONS EXIST)
-------------------------------------------------------- */
export const updateSubscriptionPlan = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    const planId = req.params.id;

    if (!provider) return sendError(res, 401, "Provider profile not found");
    if (!isValidId(planId)) return sendError(res, 400, "Invalid plan ID");

    const plan = await SubscriptionPlan.findOne({
      _id: planId,
      provider: provider._id,
    });

    if (!plan) return sendError(res, 404, "Plan not found");

    // ---------------------------------------
    // ❗ Check if any subscriptions exist for this plan
    // ---------------------------------------
    const subCount = await Subscription.countDocuments({ plan: planId });

    const updates = {};
    PLAN_ALLOWED_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const allowedFreq = ["weekly", "biweekly", "monthly", "yearly"];

    // -----------------------------------------------------
    // 🔒 If subscriptions exist, block fields that affect billing structure
    // -----------------------------------------------------
    if (subCount > 0) {
      const blocked = [];

      if (updates.price !== undefined && updates.price !== plan.price) {
        blocked.push("price");
        delete updates.price;
      }

      if (
        updates.billingFrequency &&
        updates.billingFrequency !== plan.billingFrequency
      ) {
        blocked.push("billingFrequency");
        delete updates.billingFrequency;
      }

      if (updates.hasTrial !== undefined) {
        blocked.push("hasTrial");
        delete updates.hasTrial;
      }

      if (updates.trial !== undefined) {
        blocked.push("trial");
        delete updates.trial;
      }

      if (blocked.length > 0) {
        return sendError(
          res,
          400,
          `This plan cannot modify: ${blocked.join(
            ", "
          )} because subscriptions already exist. Cancel + recreate a new plan to change these settings.`
        );
      }
    }

    // -----------------------------------------------------
    // Normal validations
    // -----------------------------------------------------
    if (updates.billingFrequency && !allowedFreq.includes(updates.billingFrequency)) {
      return sendError(res, 400, "Invalid billingFrequency");
    }

    if (updates.price !== undefined) {
      updates.price = safeNumber(updates.price);
      if (updates.price <= 0) {
        return sendError(res, 400, "price must be greater than zero");
      }
    }

    const updated = await SubscriptionPlan.findOneAndUpdate(
      { _id: plan._id },
      updates,
      { new: true }
    );

    return res.json({ success: true, plan: updated });
  } catch (err) {
    console.log("❌ updateSubscriptionPlan error:", err);
    return sendError(res, 500, "Failed to update plan");
  }
};

/* -------------------------------------------------------
   DELETE PLAN
-------------------------------------------------------- */
export const deleteSubscriptionPlan = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    const planId = req.params.id;

    if (!provider) return sendError(res, 401, "Provider profile not found");
    if (!isValidId(planId)) return sendError(res, 400, "Invalid plan ID");

    const activeSubs = await Subscription.countDocuments({ plan: planId });
    if (activeSubs > 0) {
      return sendError(
        res,
        400,
        "Cannot delete plan with active subscriptions. Cancel all subscriptions first."
      );
    }

    const plan = await SubscriptionPlan.findOneAndDelete({
      _id: planId,
      provider: provider._id,
    });

    if (!plan) return sendError(res, 404, "Plan not found");

    return res.json({ success: true, message: "Plan deleted" });
  } catch (err) {
    console.log("❌ deleteSubscriptionPlan error:", err);
    return sendError(res, 500, "Failed to delete plan");
  }
};

/* -------------------------------------------------------
   SUBSCRIBERS FOR A PLAN
-------------------------------------------------------- */
export const getPlanSubscribers = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    const planId = req.params.id;

    if (!provider) return sendError(res, 401, "Provider profile not found");
    if (!isValidId(planId)) return sendError(res, 400, "Invalid plan ID");

    const plan = await SubscriptionPlan.findOne({
      _id: planId,
      provider: provider._id,
    });

    if (!plan) return sendError(res, 404, "Plan not found");

    const subs = await Subscription.find({ plan: plan._id }).populate("client");

    const subscribers = subs.map((s) => ({
      id: s._id,
      name: s.client?.name || "Unknown Client",
      status: s.status,
      nextBilling: s.nextBillingDate,
      amount: safeNumber(s.price),
    }));

    return res.json({ success: true, subscribers });
  } catch (err) {
    console.log("❌ getPlanSubscribers error:", err);
    return sendError(res, 500, "Failed to fetch subscribers");
  }
};

/* -------------------------------------------------------
   UPCOMING CHARGES
-------------------------------------------------------- */
export const getPlanUpcomingCharges = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    const planId = req.params.id;

    if (!provider) return sendError(res, 401, "Provider profile not found");
    if (!isValidId(planId)) return sendError(res, 400, "Invalid plan ID");

    const plan = await SubscriptionPlan.findOne({
      _id: planId,
      provider: provider._id,
    });

    if (!plan) return sendError(res, 404, "Plan not found");

    const subs = await Subscription.find({ plan: plan._id });

    const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const upcomingCharges = [
      {
        id: "t1",
        date: "Tomorrow",
        count: subs.filter((s) => isTomorrow(s.nextBillingDate)).length,
        total: subs
          .filter((s) => isTomorrow(s.nextBillingDate))
          .reduce((a, s) => a + safeNumber(s.price), 0),
      },
      {
        id: "t2",
        date: "Next 7 days",
        count: subs.filter((s) => s.nextBillingDate <= sevenDays).length,
        total: subs
          .filter((s) => s.nextBillingDate <= sevenDays)
          .reduce((a, s) => a + safeNumber(s.price), 0),
      },
    ];

    return res.json({ success: true, upcomingCharges });
  } catch (err) {
    console.log("❌ getPlanUpcomingCharges error:", err);
    return sendError(res, 500, "Failed to fetch upcoming charges");
  }
};

/* -------------------------------------------------------
   ACTIVITY FEED
-------------------------------------------------------- */
export const getPlanActivity = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    const planId = req.params.id;

    if (!provider) return sendError(res, 401, "Provider profile not found");
    if (!isValidId(planId)) return sendError(res, 400, "Invalid plan ID");

    const plan = await SubscriptionPlan.findOne({
      _id: planId,
      provider: provider._id,
    });

    if (!plan) return sendError(res, 404, "Plan not found");

    const activityRaw = await SubscriptionCharge.find({ plan: plan._id })
      .sort({ createdAt: -1 })
      .limit(20);

    const activity = activityRaw.map((c) => ({
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
      detail: `$${c.amount} ${c.currency} • via ${c.method}`,
      time: c.createdAt,
    }));

    return res.json({ success: true, activity });
  } catch (err) {
    console.log("❌ getPlanActivity error:", err);
    return sendError(res, 500, "Failed to fetch activity");
  }
};

/* -------------------------------------------------------
   PLAN ANALYTICS
-------------------------------------------------------- */
export const getPlanAnalytics = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    const planId = req.params.id;

    if (!provider) return sendError(res, 401, "Provider profile not found");
    if (!isValidId(planId)) return sendError(res, 400, "Invalid plan ID");

    const plan = await SubscriptionPlan.findOne({
      _id: planId,
      provider: provider._id,
    });

    if (!plan) return sendError(res, 404, "Plan not found");

    const subs = await Subscription.find({ plan: planId });

    const stats = {
      activeCount: subs.filter((s) => s.status === "active").length,
      pausedCount: subs.filter((s) => s.status === "paused").length,
      pastDueCount: subs.filter((s) => s.status === "past_due").length,
      canceledCount: subs.filter((s) => s.status === "canceled").length,
    };

    const mrr = stats.activeCount * safeNumber(plan.price);
    const arr = mrr * 12;

    return res.json({
      success: true,
      analytics: {
        ...stats,
        mrr,
        arr,
      },
    });
  } catch (err) {
    console.log("❌ getPlanAnalytics error:", err);
    return sendError(res, 500, "Failed to fetch analytics");
  }
};

/* -------------------------------------------------------
   FULL PLAN DETAIL VIEW
-------------------------------------------------------- */
export const getSubscriptionPlanDetails = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    const planId = req.params.id;

    if (!provider) return sendError(res, 401, "Provider profile not found");
    if (!isValidId(planId)) return sendError(res, 400, "Invalid plan ID");

    const plan = await SubscriptionPlan.findOne({
      _id: planId,
      provider: provider._id,
    });

    if (!plan) return sendError(res, 404, "Plan not found");

    const subs = await Subscription.find({ plan: planId }).populate("client");

    const stats = {
      activeCount: subs.filter((s) => s.status === "active").length,
      pausedCount: subs.filter((s) => s.status === "paused").length,
      pastDueCount: subs.filter((s) => s.status === "past_due").length,
      canceledCount: subs.filter((s) => s.status === "canceled").length,
    };

    const subscribers = subs.map((s) => ({
      id: s._id,
      name: s.client?.name || "Unknown Client",
      status: s.status,
      nextBilling: s.nextBillingDate,
      amount: safeNumber(s.price),
    }));

    const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const upcomingCharges = [
      {
        id: "t1",
        date: "Tomorrow",
        count: subs.filter((s) => isTomorrow(s.nextBillingDate)).length,
        total: subs
          .filter((s) => isTomorrow(s.nextBillingDate))
          .reduce((a, s) => a + safeNumber(s.price), 0),
      },
      {
        id: "t2",
        date: "Next 7 days",
        count: subs.filter((s) => s.nextBillingDate <= sevenDays).length,
        total: subs
          .filter((s) => s.nextBillingDate <= sevenDays)
          .reduce((a, s) => a + safeNumber(s.price), 0),
      },
    ];

    const activityRaw = await SubscriptionCharge.find({ plan: planId })
      .sort({ createdAt: -1 })
      .limit(20);

    const activity = activityRaw.map((c) => ({
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
      detail: `$${c.amount} ${c.currency} • via ${c.method}`,
      time: c.createdAt,
    }));

    const mrr = stats.activeCount * safeNumber(plan.price);
    const arr = mrr * 12;

    return res.json({
      success: true,
      plan: {
        id: plan._id,
        name: plan.planName || plan.name,
        price: plan.price,
        currency: plan.currency,
        interval: plan.billingFrequency,
        autoBilling: plan.autoBilling,
        ...stats,
        mrr,
        arr,
        reminderDays: plan?.reminder?.daysBefore || null,
        minCycles: plan?.minCyclesLock?.minCycles || null,
        trial: plan.hasTrial ? plan.trial : null,
      },
      subscribers,
      upcomingCharges,
      activity,
    });
  } catch (err) {
    console.log("❌ getSubscriptionPlanDetails error:", err);
    return sendError(res, 500, "Failed to fetch plan details");
  }
};
