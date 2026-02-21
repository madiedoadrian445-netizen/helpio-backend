// src/controllers/listingController.js
import mongoose from "mongoose";
import Listing from "../models/Listing.js";
import { Provider } from "../models/Provider.js";
import { deleteFromCloudinary } from "../config/cloudinary.js";

/* -------------------------------------------------------
   HELPERS
-------------------------------------------------------- */
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

const parsePositiveInt = (value, defaultValue, max) => {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n <= 0) return defaultValue;
  return max && n > max ? max : n;
};

const safeNum = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return v;
};

const trimString = (value, maxLen = 200) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
};

/* -------------------------------------------------------
   GET PROVIDER FROM USER
-------------------------------------------------------- */
const getProviderForUser = async (userId) => {
  if (!userId) return null;
  return Provider.findOne({ user: userId }).select("_id").lean();
};

/* -------------------------------------------------------
   WHITELISTED FIELDS
-------------------------------------------------------- */
const LISTING_ALLOWED_FIELDS = [
  "businessName", // 🔥 ADD THIS
  "title",
  "description",
  "price",
  "category",
  "images",
  "location",
  "isActive",
];

/* -------------------------------------------------------
   NORMALIZE LISTING INPUT
-------------------------------------------------------- */
const normalizeListingInput = (data = {}) => {
  const cleaned = {};

if (data.businessName !== undefined) {
  cleaned.businessName = trimString(data.businessName, 120);
}


  if (data.title !== undefined) {
    cleaned.title = trimString(data.title, 200);
  }

  if (data.description !== undefined) {
    cleaned.description = trimString(data.description, 5000);
  }

  if (data.category !== undefined) {
    cleaned.category = trimString(data.category, 200);
  }

  if (data.price !== undefined) {
    cleaned.price = safeNum(data.price);
  }

 if (data.location !== undefined) {
  const loc = data.location || {};

  // Support BOTH formats:
  // 1) { lat, lng }
  // 2) { coordinates: { coordinates: [lng, lat] } }

  let lat = Number(loc.lat);
  let lng = Number(loc.lng);

  const nested = loc?.coordinates?.coordinates;

  if (
    (!Number.isFinite(lat) || !Number.isFinite(lng)) &&
    Array.isArray(nested) &&
    nested.length === 2
  ) {
    lng = Number(nested[0]);
    lat = Number(nested[1]);
  }

  cleaned.location = {
    city: trimString(loc.city || "", 200),
    state: trimString(loc.state || "", 200),
    zip: trimString(loc.zip || "", 20),

    ...(Number.isFinite(lat) &&
      Number.isFinite(lng) && {
        coordinates: {
          type: "Point",
          coordinates: [lng, lat],
        },
      }),
  };
}



  if (data.images !== undefined) {
    if (Array.isArray(data.images)) {
      cleaned.images = data.images
        .filter((img) => typeof img === "string")
        .map((img) => img.trim())
        .filter(Boolean)
        .slice(0, 25);
    } else {
      cleaned.images = [];
    }
  }

  if (data.isActive !== undefined) {
    cleaned.isActive =
      typeof data.isActive === "boolean"
        ? data.isActive
        : data.isActive === "false"
        ? false
        : true;
  }

  return cleaned;
};

/* -------------------------------------------------------
   PUBLIC: GET ALL LISTINGS (Paginated + Filters + Search)
-------------------------------------------------------- */
export const getAllListings = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      q,
      category,
      city,
      state,
      providerId,
      minPrice,
      maxPrice,
      isActive = "true",
      sort = "desc",
    } = req.query;

    const pageNum = parsePositiveInt(page, 1);
    const limitNum = parsePositiveInt(limit, 20, 100);
    const sortOrder = sort === "asc" ? 1 : -1;

    const filter = {};

    // Only show active listings by default
    if (isActive !== undefined) {
      filter.isActive = isActive === "false" ? false : true;
    }

    if (category) {
      const cat = trimString(category, 200);
      if (cat) filter.category = new RegExp(cat, "i");
    }

    if (city) {
      const c = trimString(city, 200);
      if (c) filter["location.city"] = new RegExp(c, "i");
    }

    if (state) {
      const s = trimString(state, 200);
      if (s) filter["location.state"] = new RegExp(s, "i");
    }

    if (providerId && isValidId(providerId)) {
      filter.provider = providerId;
    }

    // Price range filter
    const minP = safeNum(minPrice);
    const maxP = safeNum(maxPrice);
    if (minP > 0 || maxP > 0) {
      filter.price = {};
      if (minP > 0) filter.price.$gte = minP;
      if (maxP > 0 && maxP >= minP) filter.price.$lte = maxP;
    }

    // Text search
    if (q) {
      const qTrim = trimString(q, 200);
      if (qTrim) {
        filter.$or = [
          { title: new RegExp(qTrim, "i") },
          { description: new RegExp(qTrim, "i") },
        ];
      }
    }

   const [listings, total] = await Promise.all([
  Listing.find(filter)
  .populate({
    path: "provider",
   select: "_id businessName phone isVerified rating"

  })
  .select(
    "title description price category images location businessName provider createdAt"
  )
  .sort({ createdAt: sortOrder })
  .skip((pageNum - 1) * limitNum)
  .limit(limitNum)
  .lean()
,

  Listing.countDocuments(filter),
]);

    return res.status(200).json({
      success: true,
      listings,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    console.error("🔥 GET ALL LISTINGS ERROR:", error);
    return sendError(res, 500, "Server error while fetching listings");
  }
};


/* -------------------------------------------------------
   GEO: GET NEARBY LISTINGS
-------------------------------------------------------- */
export const getNearbyListings = async (req, res) => {
  try {
    const { lat, lng, radius = 25, limit = 20 } = req.query;

    const latitude = Number(lat);
    const longitude = Number(lng);
    const radiusMiles = Number(radius);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return sendError(res, 400, "Valid latitude and longitude are required");
    }

    // Convert miles → meters for MongoDB
    const radiusMeters = radiusMiles * 1609.34;

    const listings = await Listing.find({
  isActive: true,
  "location.coordinates": {
    $near: {
      $geometry: {
        type: "Point",
        coordinates: [longitude, latitude],
      },
      $maxDistance: radiusMeters,
    },
  },
})
  .populate({
    path: "provider",
    select: "_id businessName phone isVerified rating",
  })
  .select("title description price category images location businessName provider createdAt")
  .limit(parsePositiveInt(limit, 20, 100))
  .lean();


    return res.status(200).json({
      success: true,
      count: listings.length,
      listings,
    });
  } catch (error) {
    console.error("🔥 GEO NEARBY LISTINGS ERROR:", error);
    return sendError(res, 500, "Server error fetching nearby listings");
  }
};

/* -------------------------------------------------------
   GET LISTING BY ID (Public)
-------------------------------------------------------- */
export const getListingById = async (req, res) => {
  try {
    const id = req.params.id;

    if (!isValidId(id)) return sendError(res, 400, "Invalid listing ID");

  const listing = await Listing.findById(id)
  .populate("provider", "_id businessName phone isVerified rating")
  .select(
    "title description price category images location businessName provider createdAt"
  )
  .lean();



    if (!listing) return sendError(res, 404, "Listing not found");

    return res.status(200).json({
      success: true,
      listing,
    });
  } catch (error) {
    console.error("🔥 GET LISTING BY ID ERROR:", error);
    return sendError(res, 500, "Server error fetching listing");
  }
};

/* -------------------------------------------------------
   PUBLIC: GET LISTINGS BY CATEGORY
-------------------------------------------------------- */
export const getListingsByCategory = async (req, res) => {
  try {
    const cat = trimString(req.params.cat || "", 200);
    const regex = new RegExp(cat, "i");

   const listings = await Listing.find({
  category: regex,
  isActive: true,
})
  .populate("provider", "_id businessName phone isVerified rating")
  .select("title description price category images location businessName provider createdAt")
  .lean();


    return res.status(200).json({
      success: true,
      listings,
    });
  } catch (error) {
    console.error("🔥 CATEGORY LISTINGS ERROR:", error);
    return sendError(res, 500, "Server error fetching category listings");
  }
};

/* -------------------------------------------------------
   CREATE LISTING (Provider)
-------------------------------------------------------- */
export const createListing = async (req, res) => {
  try {

console.log("🔥 CREATE LISTING HIT");
console.log("REQ.USER:", req.user);
console.log("REQ.BODY:", JSON.stringify(req.body, null, 2));

    const provider = await getProviderForUser(req.user?._id);

    if (!provider) {
      return sendError(res, 401, "Only providers can create listings");
    }

    const rawData = { provider: provider._id };

    LISTING_ALLOWED_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) rawData[field] = req.body[field];
    });

    const data = normalizeListingInput(rawData);

    if (!data.title) {
      return sendError(res, 400, "Title is required");
    }

   if (
  !data.location ||
  !data.location.coordinates ||
  !Array.isArray(data.location.coordinates.coordinates)
) {
  return sendError(res, 400, "Valid location with coordinates is required");
}

const listing = await Listing.create({
  ...data,
  provider: provider._id,

      isActive: data.isActive ?? true,
      views: 0,
      favorites: 0,
    });

    return res.status(201).json({
      success: true,
      listing,
    });
  } catch (error) {
    console.error("🔥 CREATE LISTING ERROR:", error);
    return sendError(res, 500, "Server error creating listing");
  }
};

/* -------------------------------------------------------
   UPDATE LISTING (Provider)
-------------------------------------------------------- */
export const updateListing = async (req, res) => {
  try {
    const id = req.params.id;

    if (!isValidId(id)) return sendError(res, 400, "Invalid listing ID");

    const listing = await Listing.findById(id);
    if (!listing) return sendError(res, 404, "Listing not found");

    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 401, "Not authorized");
    if (String(listing.provider) !== String(provider._id)) {
      return sendError(res, 403, "Not authorized to edit this listing");
    }

    /* ------------------------------
       IMAGE CLEANUP
    ------------------------------ */
    if (Array.isArray(req.body.images)) {
      const newImages = req.body.images
        .filter((img) => typeof img === "string")
        .map((img) => img.trim())
        .filter(Boolean);

      const removedImages = (listing.images || []).filter(
        (img) => !newImages.includes(img)
      );

      for (const imageUrl of removedImages) {
        try {
          const parts = imageUrl.split("/");
          const filename = parts.at(-1);
          const folder = parts.at(-2);
          const publicId = `${folder}/${filename.replace(/\.[^/.]+$/, "")}`;
          await deleteFromCloudinary(publicId);
        } catch (cleanupErr) {
          console.error("⚠️ Cloudinary cleanup failed:", cleanupErr.message);
        }
      }

      listing.images = newImages;
    }

    /* ------------------------------
       FIELD UPDATE WHITELIST
    ------------------------------ */
    const incoming = {};
    LISTING_ALLOWED_FIELDS.forEach((field) => {
      if (field === "images") return; // already handled
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        incoming[field] = req.body[field];
      }
    });

    const cleaned = normalizeListingInput(incoming);

    Object.keys(cleaned).forEach((field) => {
      if (field === "location") return; // normalize below
      listing[field] = cleaned[field];
    });

    // LOCATION NORMALIZATION (if provided)
   if (incoming.location !== undefined) {
  if (
    !cleaned.location ||
    !cleaned.location.coordinates ||
    !Array.isArray(cleaned.location.coordinates.coordinates)
  ) {
    return sendError(res, 400, "Valid location with coordinates is required");
  }

  listing.location = cleaned.location;
}

    await listing.save();

    return res.status(200).json({
      success: true,
      listing,
    });
  } catch (error) {
    console.error("🔥 UPDATE LISTING ERROR:", error);
    return sendError(res, 500, "Server error updating listing");
  }
};

/* -------------------------------------------------------
   DELETE LISTING (Provider)
-------------------------------------------------------- */
export const deleteListing = async (req, res) => {
  try {
    const id = req.params.id;
    if (!isValidId(id)) return sendError(res, 400, "Invalid listing ID");

    const provider = await getProviderForUser(req.user?._id);
    if (!provider) return sendError(res, 401, "Not authorized");

    const listing = await Listing.findOne({
      _id: id,
      provider: provider._id,
    });

    if (!listing) return sendError(res, 404, "Listing not found");

    // DELETE ALL CLOUDINARY IMAGES
    if (Array.isArray(listing.images) && listing.images.length > 0) {
      for (const imageUrl of listing.images) {
        try {
          const parts = imageUrl.split("/");
          const filename = parts.at(-1);
          const folder = parts.at(-2);
          const publicId = `${folder}/${filename.replace(/\.[^/.]+$/, "")}`;
          await deleteFromCloudinary(publicId);
        } catch (cleanupErr) {
          console.error("⚠️ Cloudinary cleanup failed:", cleanupErr.message);
        }
      }
    }

    await listing.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Listing deleted",
    });
  } catch (error) {
    console.error("🔥 DELETE LISTING ERROR:", error);
    return sendError(res, 500, "Server error deleting listing");
  }
};

