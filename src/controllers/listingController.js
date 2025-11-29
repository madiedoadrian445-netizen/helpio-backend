// src/controllers/listingController.js
import { Listing } from "../models/Listing.js";
import { Provider } from "../models/Provider.js";
import { User } from "../models/User.js";

/* ============================================================
   FIND OR CREATE DEV USER + PROVIDER (fallback mode)
==============================================================*/
const getDevProvider = async () => {
  let devUser = await User.findOne({ email: "__dev__@helpio.com" });

  if (!devUser) {
    devUser = await User.create({
      name: "DEV USER",
      email: "__dev__@helpio.com",
      password: "devmode123",
    });
  }

  let devProvider = await Provider.findOne({ businessName: "__DEV_PROVIDER__" });

  if (!devProvider) {
    devProvider = await Provider.create({
      user: devUser._id,
      businessName: "__DEV_PROVIDER__",
      phone: "0000000000",
      email: "__dev__@helpio.com",
      address: "123 Dev St",
      city: "Miami",
      state: "FL",
      country: "USA",
      category: "Developer",
      description: "Auto-generated dev provider",
      gallery: [],
    });
  }

  return devProvider;
};

/* ============================================================
   CREATE LISTING
==============================================================*/
export const createListing = async (req, res, next) => {
  try {
    console.log("📥 Incoming create listing request:", req.body);

    // 1️⃣ Get provider from auth or fallback to DEV provider
    let provider = null;

    if (req.user?._id) {
      provider = await Provider.findOne({ user: req.user._id });
    }

    if (!provider) {
      provider = await getDevProvider(); // DEV MODE fallback
    }

    // 2️⃣ Normalize incoming data
    const {
      title,
      description,
      price,
      category,
      images = [],
      location = "",
    } = req.body;

    if (!title || !description || !price || !category) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: title, description, price, category.",
      });
    }

    const payload = {
      provider: provider._id,
      title,
      description,
      price,
      category,
      images,
      location: {
        city: location || "Miami",
        state: "FL",
        country: "USA",
      },
    };

    // 3️⃣ Save listing
    const listing = await Listing.create(payload);

    console.log("✅ LISTING SAVED:", listing);

    return res.status(201).json({
      success: true,
      listing,
    });
  } catch (err) {
    console.log("❌ createListing ERROR:", err);
    next(err);
  }
};

/* ============================================================
   UPDATE LISTING
==============================================================*/
export const updateListing = async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ success: false, message: "Listing not found" });
    }

    let provider;
    if (req.user?._id) {
      provider = await Provider.findOne({ user: req.user._id });
    } else {
      provider = await getDevProvider();
    }

    if (listing.provider.toString() !== provider._id.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    Object.assign(listing, req.body);
    await listing.save();

    return res.json({ success: true, listing });
  } catch (err) {
    next(err);
  }
};

/* ============================================================
   GET ALL LISTINGS
==============================================================*/
export const getAllListings = async (req, res, next) => {
  try {
    const listings = await Listing.find()
      .populate("provider")
      .sort({ createdAt: -1 });

    console.log("📤 Returning listings:", listings.length);

    return res.json({
      success: true,
      listings,
    });
  } catch (err) {
    next(err);
  }
};

/* ============================================================
   GET LISTINGS BY CATEGORY
==============================================================*/
export const getListingsByCategory = async (req, res, next) => {
  try {
    const listings = await Listing.find({ category: req.params.cat })
      .populate("provider")
      .sort({ createdAt: -1 });

    return res.json({ success: true, listings });
  } catch (err) {
    next(err);
  }
};

/* ============================================================
   GET SINGLE LISTING
==============================================================*/
export const getListingById = async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id).populate("provider");

    if (!listing) {
      return res.status(404).json({ success: false, message: "Listing not found" });
    }

    listing.views += 1;
    await listing.save();

    return res.json({ success: true, listing });
  } catch (err) {
    next(err);
  }
};

/* ============================================================
   DELETE LISTING
==============================================================*/
export const deleteListing = async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({ success: false, message: "Listing not found" });
    }

    let provider;
    if (req.user?._id) {
      provider = await Provider.findOne({ user: req.user._id });
    } else {
      provider = await getDevProvider();
    }

    if (listing.provider.toString() !== provider._id.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    await listing.deleteOne();

    return res.json({ success: true, message: "Listing removed" });
  } catch (err) {
    next(err);
  }
};
