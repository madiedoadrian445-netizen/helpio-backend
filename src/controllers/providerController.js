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
  "logo",
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

/* =======================================================
   UPDATE PROVIDER
======================================================= */
export const updateProvider = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (!userId) return sendError(res, 401, "Unauthorized");

    const provider = await Provider.findOne({ user: userId });
    if (!provider) return sendError(res, 404, "Provider profile not found");

    ALLOWED_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) {
        provider[field] = req.body[field];
      }
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
    const provider = await Provider.findOne({ user: req.user?._id }).lean(); // 🚀 faster

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

    if (city) filters.city = city;
    if (category) filters.category = category;

    // 🔍 Text search (uses your text index)
    if (q) {
      filters.$text = { $search: q };
    }

    const numericLimit = Math.min(
      Math.max(Number(limit) || 50, 1),
      100
    ); // cap to 100 per page
    const numericPage = Math.max(Number(page) || 1, 1);
    const skip = (numericPage - 1) * numericLimit;

    const providers = await Provider.find(filters)
      .select(
        "businessName city state rating services logo coverImageUrl category isVerified createdAt"
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
      .populate("user", "name email")
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
