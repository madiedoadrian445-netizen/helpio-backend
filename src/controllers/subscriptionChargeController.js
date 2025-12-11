// src/controllers/subscriptionChargeController.js
import mongoose from "mongoose";
import SubscriptionCharge from "../models/SubscriptionCharge.js";
import Subscription from "../models/Subscription.js";
import SubscriptionPlan from "../models/SubscriptionPlan.js";
import Provider from "../models/Provider.js";

/* -------------------------------------------------------
   Helpers
-------------------------------------------------------- */
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

const getProviderForUser = async (userId) => {
  if (!userId) return null;
  // We always scope by Provider _id, never user _id
  return Provider.findOne({ user: userId }).select("_id").lean();
};

/* Shared populate settings (consistent across all entry points) */
const POPULATE = [
  { path: "client", select: "name email phone address" },
  // SubscriptionPlan uses `planName`, not `name`
  { path: "plan", select: "planName price currency billingFrequency" },
  { path: "subscription", select: "status nextBillingDate cycleCount" },
];

/* Build pagination safely */
const getPagination = (req) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

/* Attach optional filters (status, date range) */
const applyCommonFilters = (query, req) => {
  const { status, startDate, endDate } = req.query;

  // Optional status filter (paid / failed / refunded)
  if (status && typeof status === "string") {
    query.status = status;
  }

  // Date range filters against billedAt (matches schema)
  if (startDate || endDate) {
    query.billedAt = {};
    if (startDate) {
      const d = new Date(startDate);
      if (!Number.isNaN(d.getTime())) {
        query.billedAt.$gte = d;
      }
    }
    if (endDate) {
      const d = new Date(endDate);
      if (!Number.isNaN(d.getTime())) {
        query.billedAt.$lte = d;
      }
    }
    // Clean up if invalid dates removed both keys
    if (Object.keys(query.billedAt).length === 0) {
      delete query.billedAt;
    }
  }

  return query;
};

/* -------------------------------------------------------
   LIST ALL CHARGES FOR PROVIDER
   GET /api/subscriptions/charges/provider
-------------------------------------------------------- */
export const getChargesForProvider = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 401, "Provider profile not found");

    const { page, limit, skip } = getPagination(req);

    let query = { provider: provider._id };
    query = applyCommonFilters(query, req);

    const [charges, total] = await Promise.all([
      SubscriptionCharge.find(query)
        .populate(POPULATE)
        .sort({ billedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SubscriptionCharge.countDocuments(query),
    ]);

    return res.json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      charges,
    });
  } catch (err) {
    console.error("❌ getChargesForProvider error:", err);
    return sendError(res, 500, "Failed to fetch subscription charges");
  }
};

/* -------------------------------------------------------
   CHARGES FOR A SPECIFIC SUBSCRIPTION
   GET /api/subscriptions/charges/subscription/:id
-------------------------------------------------------- */
export const getChargesForSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return sendError(res, 400, "Invalid subscription ID");

    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 401, "Provider profile not found");

    const subscription = await Subscription.findById(id).lean();
    if (!subscription) return sendError(res, 404, "Subscription not found");

    if (String(subscription.provider) !== String(provider._id)) {
      return sendError(res, 403, "Access denied");
    }

    const { page, limit, skip } = getPagination(req);

    let query = { subscription: id, provider: provider._id };
    query = applyCommonFilters(query, req);

    const [charges, total] = await Promise.all([
      SubscriptionCharge.find(query)
        .populate(POPULATE)
        .sort({ billedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SubscriptionCharge.countDocuments(query),
    ]);

    return res.json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      charges,
    });
  } catch (err) {
    console.error("❌ getChargesForSubscription error:", err);
    return sendError(res, 500, "Failed to fetch charges for subscription");
  }
};

/* -------------------------------------------------------
   CHARGES FOR A SPECIFIC CLIENT
   GET /api/subscriptions/charges/client/:id
-------------------------------------------------------- */
export const getChargesForClient = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return sendError(res, 400, "Invalid client ID");

    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 401, "Provider profile not found");

    const { page, limit, skip } = getPagination(req);

    let query = {
      client: id,
      provider: provider._id,
    };
    query = applyCommonFilters(query, req);

    const [charges, total] = await Promise.all([
      SubscriptionCharge.find(query)
        .populate(POPULATE)
        .sort({ billedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SubscriptionCharge.countDocuments(query),
    ]);

    return res.json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      charges,
    });
  } catch (err) {
    console.error("❌ getChargesForClient error:", err);
    return sendError(res, 500, "Failed to fetch client charges");
  }
};

/* -------------------------------------------------------
   CHARGES FOR A SPECIFIC PLAN
   GET /api/subscriptions/charges/plan/:id
-------------------------------------------------------- */
export const getChargesForPlan = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return sendError(res, 400, "Invalid plan ID");

    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 401, "Provider profile not found");

    const plan = await SubscriptionPlan.findById(id).lean();
    if (!plan) return sendError(res, 404, "Plan not found");

    if (String(plan.provider) !== String(provider._id)) {
      return sendError(res, 403, "Access denied");
    }

    const { page, limit, skip } = getPagination(req);

    let query = { plan: id, provider: provider._id };
    query = applyCommonFilters(query, req);

    const [charges, total] = await Promise.all([
      SubscriptionCharge.find(query)
        .populate(POPULATE)
        .sort({ billedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SubscriptionCharge.countDocuments(query),
    ]);

    return res.json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      charges,
    });
  } catch (err) {
    console.error("❌ getChargesForPlan error:", err);
    return sendError(res, 500, "Failed to fetch plan charges");
  }
};
