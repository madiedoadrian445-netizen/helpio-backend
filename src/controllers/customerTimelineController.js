// src/controllers/customerTimelineController.js

import mongoose from "mongoose";
import { Customer } from "../models/Customer.js";
import { Provider } from "../models/Provider.js";
import { CustomerTimeline } from "../models/CustomerTimeline.js";

/* -----------------------------------------------------
   Helpers
------------------------------------------------------ */
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

const parsePositiveInt = (v, def, max) => {
  const n = parseInt(v, 10);
  if (Number.isNaN(n) || n <= 0) return def;
  return max && n > max ? max : n;
};

const getProviderForUser = async (userId) => {
  if (!userId) return null;
  return Provider.findOne({ user: userId }).select("_id").lean();
};

/* -----------------------------------------------------
   Sanitization for timeline entry
------------------------------------------------------ */
const cleanTimelineInput = (body = {}) => {
  const cleaned = {};

  cleaned.type = typeof body.type === "string" ? body.type.trim() : "note";
  cleaned.title =
    typeof body.title === "string"
      ? body.title.trim().slice(0, 200)
      : "";
  cleaned.description =
    typeof body.description === "string"
      ? body.description.trim().slice(0, 2000)
      : "";
  cleaned.amount =
    typeof body.amount === "number" ? body.amount : null;

  // Optional references
  if (isValidId(body.invoice)) cleaned.invoice = body.invoice;
  if (isValidId(body.subscription)) cleaned.subscription = body.subscription;
  if (isValidId(body.subscriptionCharge))
    cleaned.subscriptionCharge = body.subscriptionCharge;

  return cleaned;
};

/* -----------------------------------------------------
   ADD TIMELINE ENTRY
   POST /api/customers/:customerId/timeline
------------------------------------------------------ */
export const addTimelineEntry = async (req, res, next) => {
  try {
    const { customerId } = req.params;

    if (!isValidId(customerId))
      return sendError(res, 400, "Invalid customer ID");

    const provider = await getProviderForUser(req.user?._id);
    if (!provider)
      return sendError(res, 404, "Provider profile not found");

    const customer = await Customer.findOne({
      _id: customerId,
      provider: provider._id,
    }).lean();

    if (!customer) return sendError(res, 404, "Customer not found");

    const clean = cleanTimelineInput(req.body);

    if (!clean.title)
      return sendError(res, 400, "Timeline entry title cannot be empty");

    const entry = await CustomerTimeline.create({
      provider: provider._id,
      customer: customerId,
      ...clean,
    });

    return res.status(201).json({
      success: true,
      entry,
    });
  } catch (err) {
    console.error("❌ addTimelineEntry error:", err);
    next(err);
  }
};

/* -----------------------------------------------------
   GET TIMELINE FOR CUSTOMER (Paginated + Filtered)
   GET /api/customers/:customerId/timeline
------------------------------------------------------ */
export const getTimeline = async (req, res, next) => {
  try {
    const { customerId } = req.params;

    console.log("🔥 getTimeline hit — customerId =", customerId);

    if (!isValidId(customerId))
      return sendError(res, 400, "Invalid customer ID");

    const provider = await getProviderForUser(req.user?._id);
    if (!provider)
      return sendError(res, 404, "Provider profile not found");

    const customer = await Customer.findOne({
      _id: customerId,
      provider: provider._id,
    }).lean();

    if (!customer) return sendError(res, 404, "Customer not found");

    const {
      page = 1,
      limit = 20,
      type,
      sort = "desc",
    } = req.query;

    const pageNum = parsePositiveInt(page, 1);
    const limitNum = parsePositiveInt(limit, 20, 200);
    const sortOrder = sort === "asc" ? 1 : -1;

    const filter = {
      provider: provider._id,
      customer: customerId,
    };

    if (type && typeof type === "string") {
      filter.type = type;
    }

    const [timeline, total] = await Promise.all([
      CustomerTimeline.find(filter)
        .sort({ createdAt: sortOrder })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      CustomerTimeline.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      timeline,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (err) {
    console.error("❌ getTimeline error:", err);
    next(err);
  }
};

/* -----------------------------------------------------
   DELETE TIMELINE ENTRY
------------------------------------------------------ */
export const deleteTimelineEntry = async (req, res, next) => {
  try {
    const { entryId } = req.params;

    if (!isValidId(entryId))
      return sendError(res, 400, "Invalid timeline entry ID");

    const provider = await getProviderForUser(req.user?._id);
    if (!provider)
      return sendError(res, 404, "Provider profile not found");

    const entry = await CustomerTimeline.findOne({
      _id: entryId,
      provider: provider._id,
    }).lean();

    if (!entry)
      return sendError(res, 404, "Timeline entry not found");

    await CustomerTimeline.deleteOne({ _id: entryId });

    return res.json({
      success: true,
      message: "Timeline entry removed",
    });
  } catch (err) {
    console.error("❌ deleteTimelineEntry error:", err);
    next(err);
  }
};
