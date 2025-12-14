// src/controllers/customerController.js
import mongoose from "mongoose";
import { Customer } from "../models/Customer.js";
import { Provider } from "../models/Provider.js";
import { CustomerTimeline } from "../models/CustomerTimeline.js";
import { logCustomerTimelineEvent } from "../utils/timelineLogger.js";

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
   SAFE WHITELIST OF FIELDS
------------------------------------------------------ */
const ALLOWED_FIELDS = [
  "name",
  "email",
  "phone",
  "address",
  "notes",
  "tags",
  "stripeCustomerId",
];

/* -----------------------------------------------------
   SANITIZATION
------------------------------------------------------ */
const normalizeCustomerInput = (data = {}) => {
  const cleaned = { ...data };

  if (cleaned.name) cleaned.name = cleaned.name.trim();
  if (cleaned.email) cleaned.email = cleaned.email.toLowerCase().trim();
  if (cleaned.phone) cleaned.phone = cleaned.phone.trim();
  if (cleaned.address) cleaned.address = cleaned.address.trim();
  if (cleaned.notes) cleaned.notes = cleaned.notes.trim().slice(0, 500);

  if (Array.isArray(cleaned.tags)) {
    cleaned.tags = cleaned.tags
      .filter((t) => typeof t === "string" && t.trim().length <= 50)
      .map((t) => t.trim())
      .slice(0, 50);
  }

  return cleaned;
};

/* -----------------------------------------------------
   CREATE CUSTOMER
------------------------------------------------------ */
export const createCustomer = async (req, res, next) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 404, "Provider profile not found");

    let data = { provider: provider._id };
    ALLOWED_FIELDS.forEach((f) => {
      if (req.body[f] !== undefined) data[f] = req.body[f];
    });

    data = normalizeCustomerInput(data);

    if (!data.name || data.name.length < 2) {
      return sendError(res, 400, "Customer name is required");
    }

    const customer = await Customer.create(data);

    // Timeline (non-critical, centralized)
try {
  await logCustomerTimelineEvent({
    providerId: provider._id,
    customerId: customer._id,
    type: "note",
    title: "New client added",
    description: `Client ${customer.name} was added to your CRM.`,
  });
} catch {}


    return res.status(201).json({ success: true, customer });
  } catch (err) {
    console.error("❌ createCustomer error:", err);
    next(err);
  }
};

/* -----------------------------------------------------
   GET ALL CUSTOMERS (Paginated + Search + Tags)
------------------------------------------------------ */
export const getMyCustomers = async (req, res, next) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 404, "Provider profile not found");

    const {
      page = 1,
      limit = 20,
      q,
      tag,
      sort = "desc",
    } = req.query;

    const pageNum = parsePositiveInt(page, 1);
    const limitNum = parsePositiveInt(limit, 20, 100);
    const sortOrder = sort === "asc" ? 1 : -1;

    const filter = { provider: provider._id };

    // Search across multiple fields
    if (q && q.trim()) {
      const regex = new RegExp(q.trim(), "i");
      filter.$or = [
        { name: regex },
        { email: regex },
        { phone: regex },
        { address: regex },
        { notes: regex },
        { tags: regex },
      ];
    }

    if (tag) {
      filter.tags = tag;
    }

    const [customers, total] = await Promise.all([
      Customer.find(filter)
        .sort({ createdAt: sortOrder })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Customer.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      customers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (err) {
    console.error("❌ getMyCustomers error:", err);
    next(err);
  }
};

/* -----------------------------------------------------
   GET CUSTOMER BY ID
------------------------------------------------------ */
export const getCustomerById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) return sendError(res, 400, "Invalid customer ID");

    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 404, "Provider profile not found");

    const customer = await Customer.findOne({
      _id: id,
      provider: provider._id,
    }).lean();

    if (!customer) return sendError(res, 404, "Customer not found");

    return res.json({ success: true, customer });
  } catch (err) {
    console.error("❌ getCustomerById error:", err);
    next(err);
  }
};

/* -----------------------------------------------------
   UPDATE CUSTOMER (Whitelisted + Sanitized)
------------------------------------------------------ */
export const updateCustomer = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) return sendError(res, 400, "Invalid customer ID");

    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 404, "Provider profile not found");

    const customer = await Customer.findOne({
      _id: id,
      provider: provider._id,
    });

    if (!customer) return sendError(res, 404, "Customer not found");

    let data = {};
    ALLOWED_FIELDS.forEach((f) => {
      if (req.body[f] !== undefined) data[f] = req.body[f];
    });

    data = normalizeCustomerInput(data);

    Object.assign(customer, data);
    await customer.save();

    // Timeline (non-critical, centralized)
try {
  await logCustomerTimelineEvent({
    providerId: provider._id,
    customerId: customer._id,
    type: "note",
    title: "Client updated",
    description: `Information for ${customer.name} was updated.`,
  });
} catch {}


    return res.json({ success: true, customer });
  } catch (err) {
    console.error("❌ updateCustomer error:", err);
    next(err);
  }
};

/* -----------------------------------------------------
   DELETE CUSTOMER
------------------------------------------------------ */
export const deleteCustomer = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) return sendError(res, 400, "Invalid customer ID");

    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 404, "Provider profile not found");

    const customer = await Customer.findOne({
      _id: id,
      provider: provider._id,
    });

    if (!customer) return sendError(res, 404, "Customer not found");

    const deletedName = customer.name;

    await Customer.deleteOne({ _id: id });

    try {
  await logCustomerTimelineEvent({
    providerId: provider._id,
    customerId: customer._id,
    type: "note",
    title: "Client deleted",
    description: `${deletedName} was removed from your CRM.`,
  });
} catch {}


    return res.json({ success: true, message: "Customer removed" });
  } catch (err) {
    console.error("❌ deleteCustomer error:", err);
    next(err);
  }
};

/* -----------------------------------------------------
   SEARCH CUSTOMERS (Provider Scoped, Paginated)
------------------------------------------------------ */
export const searchCustomers = async (req, res, next) => {
  try {
    const { q, page = 1, limit = 50, tag } = req.query;

    if (!q || q.trim().length === 0) {
      return sendError(res, 400, "Search query cannot be empty");
    }

    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 404, "Provider profile not found");

    const pageNum = parsePositiveInt(page, 1);
    const limitNum = parsePositiveInt(limit, 50, 100);

    const regex = new RegExp(q.trim(), "i");

    const filter = {
      provider: provider._id,
      $or: [
        { name: regex },
        { email: regex },
        { phone: regex },
        { address: regex },
        { notes: regex },
        { tags: regex },
      ],
    };

    if (tag) filter.tags = tag;

    const [customers, total] = await Promise.all([
      Customer.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Customer.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      query: q.trim(),
      results: customers.length,
      customers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (err) {
    console.error("❌ searchCustomers error:", err);
    next(err);
  }
};
