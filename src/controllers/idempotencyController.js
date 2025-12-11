// src/controllers/idempotencyController.js

import IdempotencyKey from "../models/IdempotencyKey.js";
import Provider from "../models/Provider.js";
import mongoose from "mongoose";
import { formatIdempotencyRecord } from "../utils/idempotencyFormatter.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

/* -------------------------------------------------------
   BUILD SORT OPTION
------------------------------------------------------- */
const buildSortOption = (sortBy, direction) => {
  const dir = direction === "asc" ? 1 : -1;

  switch (sortBy) {
    case "amount":
      return { amount: dir };
    case "updatedAt":
      return { updatedAt: dir };
    case "type":
      return { type: dir };
    case "status":
      return { status: dir };
    case "createdAt":
    default:
      return { createdAt: dir };
  }
};

/* -------------------------------------------------------
   ADMIN — GET ALL IDEMPOTENCY RECORDS
------------------------------------------------------- */
export const getAllIdempotencyKeys = async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return sendError(res, 403, "Admin access required.");
    }

    const {
      page = 1,
      limit = 20,
      type,
      status,
      providerId,
      customerId,
      subscriptionId,
      invoiceId,
      sortBy = "createdAt",
      direction = "desc",
    } = req.query;

    const query = {};

    // Filters
    if (type) query.type = type;
    if (status) query.status = status;

    if (providerId && isValidId(providerId)) query.providerId = providerId;
    if (customerId && isValidId(customerId)) query.customerId = customerId;
    if (subscriptionId && isValidId(subscriptionId)) query.subscriptionId = subscriptionId;
    if (invoiceId && isValidId(invoiceId)) query.invoiceId = invoiceId;

    const skip = (Number(page) - 1) * Number(limit);

    const sortOption = buildSortOption(sortBy, direction);

    const records = await IdempotencyKey.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(Number(limit));

    const total = await IdempotencyKey.countDocuments(query);

    return res.json({
      success: true,
      page: Number(page),
      limit: Number(limit),
      total,
      sortBy,
      direction,
      records: records.map(formatIdempotencyRecord),
    });
  } catch (err) {
    console.error("❌ getAllIdempotencyKeys error:", err);
    return sendError(res, 500, "Server error fetching idempotency keys.");
  }
};

/* -------------------------------------------------------
   PROVIDER — GET IDEMPOTENCY RECORDS FOR LOGGED-IN PROVIDER
------------------------------------------------------- */
export const getProviderIdempotencyKeys = async (req, res) => {
  try {
    const provider = await Provider.findOne({ user: req.user?._id });

    if (!provider) {
      return sendError(res, 404, "Provider not found");
    }

    const {
      page = 1,
      limit = 20,
      type,
      status,
      customerId,
      subscriptionId,
      invoiceId,
      sortBy = "createdAt",
      direction = "desc",
    } = req.query;

    const query = { providerId: provider._id };

    // Filters
    if (type) query.type = type;
    if (status) query.status = status;

    if (customerId && isValidId(customerId)) query.customerId = customerId;
    if (subscriptionId && isValidId(subscriptionId)) query.subscriptionId = subscriptionId;
    if (invoiceId && isValidId(invoiceId)) query.invoiceId = invoiceId;

    const skip = (Number(page) - 1) * Number(limit);

    const sortOption = buildSortOption(sortBy, direction);

    const records = await IdempotencyKey.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(Number(limit));

    const total = await IdempotencyKey.countDocuments(query);

    return res.json({
      success: true,
      provider: provider._id,
      page: Number(page),
      limit: Number(limit),
      total,
      sortBy,
      direction,
      records: records.map(formatIdempotencyRecord),
    });
  } catch (err) {
    console.error("❌ getProviderIdempotencyKeys error:", err);
    return sendError(res, 500, "Server error fetching provider idempotency keys.");
  }
};
