// src/controllers/providerController.js
import mongoose from "mongoose";
import { Provider } from "../models/Provider.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

/* -------------------------------------------------------
   Allowed fields that a provider can SET or UPDATE
-------------------------------------------------------- */
const ALLOWED_FIELDS = [
  "businessName",
  "phone",
  "email",
  "address",
  "city",
  "state",
  "zip",
  "country",
  "description",
  "services",
  "website",
  "socials",
  "geoLocation",
 "logoUrl",
  "isPublic",
];

/* =======================================================
   CREATE PROVIDER
======================================================= */
export const createProvider = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (!userId) return sendError(res, 401, "Unauthorized");

    // FAST lookup with index on { user: 1 }
    const existing = await Provider.findOne({ user: userId }).lean();

    if (existing) {
      return sendError(
        res,
        400,
        "Provider profile already exists for this user"
      );
    }

    const providerData = { user: userId };
    ALLOWED_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) providerData[field] = req.body[field];
    });

    const provider = await Provider.create(providerData);

    return res.status(201).json({ success: true, provider });
  } catch (err) {
    console.error("❌ createProvider error:", err);
    next(err);
  }
};



/* -------------------------------------------------------
   NORMALIZE PROVIDER INPUT
   FIX #42 — Never assign raw req.body directly to documents.
-------------------------------------------------------- */
const normalizeProviderInput = (data = {}) => {
  const cleaned = {};
  const trimStr = (val, max = 200) => {
    if (typeof val !== "string") return undefined;
    return val.trim().slice(0, max);
  };

  if (data.businessName !== undefined) cleaned.businessName = trimStr(data.businessName, 100);
  if (data.phone !== undefined)        cleaned.phone = trimStr(data.phone, 20);
  if (data.email !== undefined)        cleaned.email = trimStr(data.email, 160)?.toLowerCase();
  if (data.address !== undefined)      cleaned.address = trimStr(data.address, 200);
  if (data.city !== undefined)         cleaned.city = trimStr(data.city, 100);
  if (data.state !== undefined)        cleaned.state = trimStr(data.state, 100);
  if (data.zip !== undefined)          cleaned.zip = trimStr(data.zip, 20);
  if (data.country !== undefined)      cleaned.country = trimStr(data.country, 100);
  if (data.category !== undefined)     cleaned.category = trimStr(data.category, 100);
  if (data.description !== undefined)  cleaned.description = trimStr(data.description, 3000);
  if (data.website !== undefined)      cleaned.website = trimStr(data.website, 200);
  if (data.logoUrl !== undefined)      cleaned.logoUrl = trimStr(data.logoUrl, 500);
  if (data.isPublic !== undefined)     cleaned.isPublic = Boolean(data.isPublic);
  if (data.services !== undefined) {
    cleaned.services = Array.isArray(data.services)
      ? data.services.filter((s) => typeof s === "string").map((s) => s.trim().slice(0, 120)).slice(0, 100)
      : [];
  }
  if (data.socials !== undefined && typeof data.socials === "object") cleaned.socials = data.socials;
  if (data.geoLocation !== undefined) cleaned.geoLocation = data.geoLocation;

  return cleaned;
};



/* =======================================================
   UPDATE PROVIDER
======================================================= */
export const updateProvider = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (!userId) return sendError(res, 401, "Unauthorized");

    const provider = await Provider.findOne({ user: userId });
    if (!provider) return sendError(res, 404, "Provider profile not found");

   const cleaned = normalizeProviderInput(req.body);
Object.keys(cleaned).forEach((field) => {
  provider[field] = cleaned[field];
});

    await provider.save();

    return res.json({ success: true, provider });
  } catch (err) {
    console.error("❌ updateProvider error:", err);
    next(err);
  }
};

/* =======================================================
   GET MY PROVIDER PROFILE
======================================================= */
export const getMyProviderProfile = async (req, res, next) => {
  try {
   const provider = await Provider.findOne({ user: req.user?._id })
  .select("-simSeeded -simArchetype -stripe_account_id")
  .lean();// 🚀 faster

    if (!provider) {
      return sendError(res, 404, "Provider profile not found");
    }

    return res.json({ success: true, provider });
  } catch (err) {
    console.error("❌ getMyProviderProfile error:", err);
    next(err);
  }
};

/* =======================================================
   PUBLIC PROVIDER LIST — Optimized for scale
======================================================= */
export const getAllProviders = async (req, res, next) => {
  try {
    // 🔥 Optional query params for pagination + search
    const {
      page = 1,
      limit = 50,
      q, // text search
      city,
      category,
      isPublic = "true",
    } = req.query;

    const filters = {};

    // Default: only public providers.
    // If ?isPublic=false is passed, we don't force isPublic=true.
    let onlyPublic = true;
    if (
      typeof isPublic === "string" &&
      isPublic.toLowerCase() === "false"
    ) {
      onlyPublic = false;
    }

    if (onlyPublic) {
      filters.isPublic = true;
    }

if (city) filters.city = new RegExp(city.trim(), "i");
if (category) filters.category = new RegExp(category.trim(), "i");

    // 🔍 Text search (uses your text index)
    if (q) {
      filters.$text = { $search: q };
    }

  const numericLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  
  
  
  // cap to 100 per page
    const numericPage = Math.max(Number(page) || 1, 1);
    const skip = (numericPage - 1) * numericLimit;

    const providers = await Provider.find(filters)
      .select(
  "businessName city state rating ratingCount services logoUrl coverImageUrl category isVerified isChoice createdAt"
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numericLimit)
      .lean()
      .exec();

    const count = await Provider.countDocuments(filters);

    return res.json({
      success: true,
      providers,
      pagination: {
        page: numericPage,
        limit: numericLimit,
        total: count,
        pages: Math.ceil(count / numericLimit),
      },
    });
  } catch (err) {
    console.error("❌ getAllProviders error:", err);
    next(err);
  }
};

/* =======================================================
   GET PROVIDER BY ID
======================================================= */
export const getProviderById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return sendError(res, 400, "Invalid provider id");
    }

    const provider = await Provider.findById(id)
   .populate("user", "name")
      .lean();

    if (!provider) {
      return sendError(res, 404, "Provider not found");
    }

    return res.json({ success: true, provider });
  } catch (err) {
    console.error("❌ getProviderById error:", err);
    next(err);
  }
};
