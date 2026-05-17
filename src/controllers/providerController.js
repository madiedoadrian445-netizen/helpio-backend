// src/controllers/providerController.js
import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import { Provider } from "../models/Provider.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

/* -------------------------------------------------------
   MULTER — memory storage (buffer sent to Cloudinary)
   Max 8 MB per image upload
-------------------------------------------------------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"), false);
    }
    cb(null, true);
  },
});

// Export so the route can apply it as middleware
export const uploadMiddleware = upload.single("file");

/* -------------------------------------------------------
   Allowed fields that a provider can SET or UPDATE
-------------------------------------------------------- */
const ALLOWED_FIELDS = [
  "businessName",
  "tagline",
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
  "coverImageUrl",
  "categories",
  "isPublic",
];

/* -------------------------------------------------------
   NORMALIZE PROVIDER INPUT
   Sanitizes and validates all writable fields.
   Never assigns raw req.body directly to documents.
-------------------------------------------------------- */
const normalizeProviderInput = (data = {}) => {
  const cleaned = {};
  const trimStr = (val, max = 200) => {
    if (typeof val !== "string") return undefined;
    return val.trim().slice(0, max);
  };

  if (data.businessName  !== undefined) cleaned.businessName  = trimStr(data.businessName, 100);
  if (data.tagline       !== undefined) cleaned.tagline       = trimStr(data.tagline, 120);
  if (data.phone         !== undefined) cleaned.phone         = trimStr(data.phone, 20);
  if (data.email         !== undefined) cleaned.email         = trimStr(data.email, 160)?.toLowerCase();
  if (data.address       !== undefined) cleaned.address       = trimStr(data.address, 200);
  if (data.city          !== undefined) cleaned.city          = trimStr(data.city, 100);
  if (data.state         !== undefined) cleaned.state         = trimStr(data.state, 100);
  if (data.zip           !== undefined) cleaned.zip           = trimStr(data.zip, 20);
  if (data.country       !== undefined) cleaned.country       = trimStr(data.country, 100);
  if (data.category      !== undefined) cleaned.category      = trimStr(data.category, 100);
  if (data.description   !== undefined) cleaned.description   = trimStr(data.description, 3000);
  if (data.website       !== undefined) cleaned.website       = trimStr(data.website, 200);
  if (data.logoUrl       !== undefined) cleaned.logoUrl       = trimStr(data.logoUrl, 500);
  if (data.coverImageUrl !== undefined) cleaned.coverImageUrl = trimStr(data.coverImageUrl, 500);
  if (data.isPublic      !== undefined) cleaned.isPublic      = Boolean(data.isPublic);

  if (data.categories !== undefined) {
    cleaned.categories = Array.isArray(data.categories)
      ? data.categories
          .filter((c) => typeof c === "string")
          .map((c) => c.trim().slice(0, 60))
          .slice(0, 20)
      : [];
  }

  if (data.services !== undefined) {
    cleaned.services = Array.isArray(data.services)
      ? data.services
          .filter((s) => typeof s === "string")
          .map((s) => s.trim().slice(0, 120))
          .slice(0, 100)
      : [];
  }

  if (data.socials !== undefined && typeof data.socials === "object") {
    cleaned.socials = data.socials;
  }

  if (data.geoLocation !== undefined) {
    cleaned.geoLocation = data.geoLocation;
  }

  return cleaned;
};

/* =======================================================
   CREATE PROVIDER
======================================================= */
export const createProvider = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (!userId) return sendError(res, 401, "Unauthorized");

    const existing = await Provider.findOne({ user: userId }).lean();
    if (existing) {
      return sendError(res, 400, "Provider profile already exists for this user");
    }

    const providerData = { user: userId };
    ALLOWED_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) providerData[field] = req.body[field];
    });

    const provider = await Provider.create(providerData);
    return res.status(201).json({ success: true, provider });
  } catch (err) {
    next(err);
  }
};

/* =======================================================
   UPDATE MY PROVIDER (by auth user — existing PUT route)
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
    next(err);
  }
};

/* =======================================================
   UPDATE PROVIDER BY ID  ← NEW
   PATCH /api/providers/:id
   Owner only — verifies req.user owns the provider
======================================================= */
export const updateProviderById = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (!userId) return sendError(res, 401, "Unauthorized");

    const { id } = req.params;
    if (!isValidId(id)) return sendError(res, 400, "Invalid provider ID");

    // Fetch and verify ownership in one query
    const provider = await Provider.findById(id);
    if (!provider) return sendError(res, 404, "Provider not found");

    if (String(provider.user) !== String(userId)) {
      return sendError(res, 403, "You do not own this provider profile");
    }

    const cleaned = normalizeProviderInput(req.body);

    if (Object.keys(cleaned).length === 0) {
      return sendError(res, 400, "No valid fields provided");
    }

    Object.keys(cleaned).forEach((field) => {
      provider[field] = cleaned[field];
    });

    await provider.save();
    return res.json({ success: true, provider });
  } catch (err) {
    next(err);
  }
};

/* =======================================================
   UPLOAD PROVIDER IMAGE  ← NEW
   POST /api/providers/:id/upload
   field param: "avatar" → updates logoUrl
                "cover"  → updates coverImageUrl
   Owner only.
======================================================= */
export const uploadProviderImage = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    if (!userId) return sendError(res, 401, "Unauthorized");

    const { id } = req.params;
    if (!isValidId(id)) return sendError(res, 400, "Invalid provider ID");

    // req.file is set by the multer uploadMiddleware applied in the route
    if (!req.file) return sendError(res, 400, "No image file provided");

    const provider = await Provider.findById(id);
    if (!provider) return sendError(res, 404, "Provider not found");

    if (String(provider.user) !== String(userId)) {
      return sendError(res, 403, "You do not own this provider profile");
    }

    const field = req.body.field || "avatar"; // "avatar" | "cover"
    if (!["avatar", "cover"].includes(field)) {
      return sendError(res, 400, "field must be 'avatar' or 'cover'");
    }

    // Upload buffer to Cloudinary
    const folder = field === "avatar" ? "helpio/avatars" : "helpio/covers";
    const publicId = `${field}_${id}_${Date.now()}`;

    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: publicId,
          overwrite: true,
          transformation: field === "avatar"
            ? [{ width: 400, height: 400, crop: "fill", gravity: "face" }]
            : [{ width: 1200, height: 675, crop: "fill" }],
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    const secureUrl = uploadResult.secure_url;

    // Save URL to the correct field
    if (field === "avatar") {
      provider.logoUrl = secureUrl;
    } else {
      provider.coverImageUrl = secureUrl;
    }

    await provider.save();

    return res.json({ success: true, url: secureUrl, provider });
  } catch (err) {
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
      .lean();

    if (!provider) return sendError(res, 404, "Provider profile not found");

    return res.json({ success: true, provider });
  } catch (err) {
    next(err);
  }
};

/* =======================================================
   PUBLIC PROVIDER LIST
======================================================= */
export const getAllProviders = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 50,
      q,
      city,
      category,
      isPublic = "true",
    } = req.query;

    const filters = {};

    let onlyPublic = true;
    if (typeof isPublic === "string" && isPublic.toLowerCase() === "false") {
      onlyPublic = false;
    }
    if (onlyPublic) filters.isPublic = true;

    if (city)     filters.city     = new RegExp(city.trim(), "i");
    if (category) filters.category = new RegExp(category.trim(), "i");
    if (q)        filters.$text    = { $search: q };

    const numericLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const numericPage  = Math.max(Number(page) || 1, 1);
    const skip         = (numericPage - 1) * numericLimit;

    const providers = await Provider.find(filters)
      .select(
        "businessName tagline city state rating ratingCount services logoUrl coverImageUrl category categories isVerified isChoice createdAt"
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
    next(err);
  }
};

/* =======================================================
   GET PROVIDER BY ID
======================================================= */
export const getProviderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return sendError(res, 400, "Invalid provider id");

    const provider = await Provider.findById(id)
      .populate("user", "name")
      .lean();

    if (!provider) return sendError(res, 404, "Provider not found");

    return res.json({ success: true, provider });
  } catch (err) {
    next(err);
  }
};