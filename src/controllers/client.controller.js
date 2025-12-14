// src/controllers/client.controller.js
import mongoose from "mongoose";
import Client from "../models/Client.js"; // 🔐 align with other controllers (Invoice, Subscriptions)
import Provider from "../models/Provider.js";
import { logCustomerTimelineEvent } from "../utils/timelineLogger.js";


const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

const parsePositiveInt = (value, fallback, max) => {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n <= 0) return fallback;
  if (max && n > max) return max;
  return n;
};

const getProviderForUser = async (userId) => {
  if (!userId) return null;
  // Only need _id for scoping
  return Provider.findOne({ user: userId }).select("_id").lean();
};

/* -------------------------------------------------------
   INPUT NORMALIZATION
-------------------------------------------------------- */
const normalizeClientInput = (data = {}) => {
  const cleaned = { ...data };

  if (cleaned.name) cleaned.name = String(cleaned.name).trim();
  if (cleaned.phone) cleaned.phone = String(cleaned.phone).trim();
  if (cleaned.phoneFormatted)
    cleaned.phoneFormatted = String(cleaned.phoneFormatted).trim();
  if (cleaned.email)
    cleaned.email = String(cleaned.email).toLowerCase().trim();
  if (cleaned.company) cleaned.company = String(cleaned.company).trim();
  if (cleaned.address) cleaned.address = String(cleaned.address).trim();
  if (cleaned.notes) cleaned.notes = String(cleaned.notes).trim();
  if (cleaned.status) cleaned.status = String(cleaned.status).trim();
  if (cleaned.source) cleaned.source = String(cleaned.source).trim();

  if (Array.isArray(cleaned.tags)) {
    cleaned.tags = cleaned.tags
      .filter((t) => typeof t === "string")
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .slice(0, 50); // cap number of tags
  }

  // Numeric aggregates
  if (cleaned.totalInvoiced != null) {
    const v = Number(cleaned.totalInvoiced);
    cleaned.totalInvoiced = Number.isNaN(v) ? 0 : v;
  }
  if (cleaned.totalPaid != null) {
    const v = Number(cleaned.totalPaid);
    cleaned.totalPaid = Number.isNaN(v) ? 0 : v;
  }

  return cleaned;
};

/* =======================================================
   CREATE CLIENT (Provider-scoped)
======================================================= */
export const createClient = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 404, "Provider profile not found");

    let {
      name,
      phone,
      phoneFormatted,
      email,
      company,
      address,
      notes,
      status,
      source,
      tags,
    } = req.body;

    const rawData = {
      name,
      phone,
      phoneFormatted,
      email,
      company,
      address,
      notes,
      status: status || "lead",
      source: source || "manual",
      tags: Array.isArray(tags) ? tags : [],
    };

    const data = normalizeClientInput(rawData);

    if (!data.name || data.name.length === 0) {
      return sendError(res, 400, "Name is required");
    }

    const client = await Client.create({
      ...data,
      provider: provider._id,
      isArchived: false,
    });

    return res.status(201).json({
      success: true,
      client,
    });
  } catch (err) {
    console.error("❌ Error creating client:", err);
    return sendError(res, 500, "Server error while creating client");
  }
};

/* =======================================================
   GET CLIENTS (search + filters + pagination)
   Provider-scoped
======================================================= */
export const getClients = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 404, "Provider profile not found");

    const {
      q,
      status, // lead / active / inactive / blocked
      tag,
      archived,
      sort = "recent", // recent | name | value | lastActivity
      page = 1,
      limit = 20,
    } = req.query;

    const pageNum = parsePositiveInt(page, 1);
    const limitNum = parsePositiveInt(limit, 20, 100);

    const filter = {
      provider: provider._id,
    };

    // Archive filter
    if (archived === "true") {
      filter.isArchived = true;
    } else if (archived === "false" || archived === undefined) {
      filter.isArchived = false;
    }

    // Status filter
    if (status && typeof status === "string") {
      filter.status = status;
    }

    // Tag filter
    if (tag && typeof tag === "string") {
      filter.tags = tag;
    }

    // Search
    if (q && q.trim().length > 0) {
      const searchTerm = q.trim().slice(0, 200); // cap length
      const regex = new RegExp(searchTerm, "i");
      filter.$or = [
        { name: regex },
        { email: regex },
        { company: regex },
        { phone: regex },
        { phoneFormatted: regex },
      ];
    }

    // Sorting
    let sortObj = { createdAt: -1 }; // default: most recent
    if (sort === "name") {
      sortObj = { name: 1 };
    } else if (sort === "value") {
      sortObj = { totalInvoiced: -1 };
    } else if (sort === "lastActivity") {
      sortObj = { lastContactAt: -1, updatedAt: -1 };
    }

    const [clients, total] = await Promise.all([
      Client.find(filter)
        .sort(sortObj)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Client.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      clients,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum) || 1,
        limit: limitNum,
      },
    });
  } catch (err) {
    console.error("❌ Error fetching clients:", err);
    return sendError(res, 500, "Server error fetching clients");
  }
};

/* =======================================================
   GET SINGLE CLIENT (Provider-scoped)
======================================================= */
export const getClientById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return sendError(res, 400, "Invalid client ID");

    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 404, "Provider profile not found");

    const client = await Client.findOne({
      _id: id,
      provider: provider._id,
    });

    if (!client) return sendError(res, 404, "Client not found");

    return res.status(200).json({
      success: true,
      client,
    });
  } catch (err) {
    console.error("❌ Error fetching client:", err);
    return sendError(res, 500, "Server error fetching client");
  }
};

/* =======================================================
   UPDATE CLIENT (Provider-scoped + whitelisted)
======================================================= */
const ALLOWED_UPDATE_FIELDS = [
  "name",
  "phone",
  "phoneFormatted",
  "email",
  "company",
  "address",
  "notes",
  "status",
  "source",
  "tags",
  "totalInvoiced",
  "totalPaid",
  "lastInvoiceAt",
  "lastContactAt",
  "isArchived",
];

export const updateClient = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return sendError(res, 400, "Invalid client ID");

    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 404, "Provider profile not found");

    const updateDataRaw = {};
    for (const key of ALLOWED_UPDATE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        updateDataRaw[key] = req.body[key];
      }
    }

    const updateData = normalizeClientInput(updateDataRaw);

    const client = await Client.findOneAndUpdate(
      { _id: id, provider: provider._id },
      updateData,
      { new: true }
    );

    if (!client) return sendError(res, 404, "Client not found");

    return res.status(200).json({
      success: true,
      client,
    });
  } catch (err) {
    console.error("❌ Error updating client:", err);
    return sendError(res, 500, "Server error updating client");
  }
};

/* =======================================================
   ARCHIVE / UNARCHIVE CLIENT (Provider-scoped)
======================================================= */
export const archiveClient = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return sendError(res, 400, "Invalid client ID");

    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 404, "Provider profile not found");

    const client = await Client.findOneAndUpdate(
      { _id: id, provider: provider._id },
      { isArchived: true },
      { new: true }
    );

    if (!client) return sendError(res, 404, "Client not found");

    return res.status(200).json({
      success: true,
      client,
    });
  } catch (err) {
    console.error("❌ Error archiving client:", err);
    return sendError(res, 500, "Server error archiving client");
  }
};

export const unarchiveClient = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return sendError(res, 400, "Invalid client ID");

    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 404, "Provider profile not found");

    const client = await Client.findOneAndUpdate(
      { _id: id, provider: provider._id },
      { isArchived: false },
      { new: true }
    );

    if (!client) return sendError(res, 404, "Client not found");

    return res.status(200).json({
      success: true,
      client,
    });
  } catch (err) {
    console.error("❌ Error unarchiving client:", err);
    return sendError(res, 500, "Server error unarchiving client");
  }
};

/* =======================================================
   DELETE CLIENT (Provider-scoped)
======================================================= */
export const deleteClient = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return sendError(res, 400, "Invalid client ID");

    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 404, "Provider profile not found");

    const client = await Client.findOneAndDelete({
      _id: id,
      provider: provider._id,
    });

    if (!client) return sendError(res, 404, "Client not found");

    return res.status(200).json({
      success: true,
      message: "Client deleted",
    });
  } catch (err) {
    console.error("❌ Error deleting client:", err);
    return sendError(res, 500, "Server error deleting client");
  }
};

/* =======================================================
   TIMELINE ENTRY (centralized CustomerTimeline + optional embedded)
======================================================= */
export const addTimelineEntry = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return sendError(res, 400, "Invalid client ID");

    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 404, "Provider profile not found");

    const client = await Client.findOne({
      _id: id,
      provider: provider._id,
    });

    if (!client) return sendError(res, 404, "Client not found");

    const { type = "note", title, message, meta = {} } = req.body;

    const entryType = String(type || "note").trim();
    const entryTitle = title ? String(title).trim() : "";
    const entryMessage = message ? String(message).trim() : "";

   // 1) Centralized timeline logger (updates CRM snapshot automatically)
try {
  await logCustomerTimelineEvent({
    providerId: provider._id,
    customerId: client._id,
    type: entryType,
    title: entryTitle || "Client activity",
    description: entryMessage,
    amount:
      typeof meta.amount === "number"
        ? meta.amount
        : meta.amount != null
        ? Number(meta.amount) || null
        : null,
    invoice: meta.invoiceId || null,
    subscription: meta.subscriptionId || null,
    subscriptionCharge: meta.subscriptionChargeId || null,
  });
} catch {
  // non-fatal
}


    // 2) Optional embedded timeline for legacy UI
    try {
      client.timeline = client.timeline || [];
      client.timeline.unshift({
        type: entryType,
        title: entryTitle,
        message: entryMessage,
        meta,
        createdAt: new Date(),
      });
      client.lastContactAt = new Date();
      await client.save();
    } catch (embeddedErr) {
      console.error(
        "⚠️ Embedded timeline update error (client):",
        embeddedErr.message
      );
    }

    return res.status(200).json({
      success: true,
      client,
    });
  } catch (err) {
    console.error("❌ Error adding timeline entry:", err);
    return sendError(res, 500, "Server error adding timeline entry");
  }
};
