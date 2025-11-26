// src/controllers/listingController.js
import { Listing } from "../models/Listing.js";
import { Provider } from "../models/Provider.js";

// POST /api/listings
export const createListing = async (req, res, next) => {
  try {
    const provider = await Provider.findOne({ user: req.user._id });

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: "Provider profile not found",
      });
    }

    const listing = await Listing.create({
      provider: provider._id,
      ...req.body,
    });

    return res.status(201).json({
      success: true,
      listing,
    });
  } catch (err) {
    next(err);
  }
};

// PUT /api/listings/:id
export const updateListing = async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found",
      });
    }

    // Ensure listing belongs to this provider
    const provider = await Provider.findOne({ user: req.user._id });

    if (!provider || listing.provider.toString() !== provider._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    Object.assign(listing, req.body);

    await listing.save();

    return res.json({
      success: true,
      listing,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/listings
export const getAllListings = async (req, res, next) => {
  try {
    const listings = await Listing.find()
      .populate("provider")
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      listings,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/listings/category/:cat
export const getListingsByCategory = async (req, res, next) => {
  try {
    const { cat } = req.params;

    const listings = await Listing.find({ category: cat })
      .populate("provider")
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      listings,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/listings/:id
export const getListingById = async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id).populate("provider");

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found",
      });
    }

    // Increment view count
    listing.views += 1;
    await listing.save();

    return res.json({
      success: true,
      listing,
    });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/listings/:id
export const deleteListing = async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found",
      });
    }

    const provider = await Provider.findOne({ user: req.user._id });

    if (!provider || listing.provider.toString() !== provider._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    await listing.deleteOne();

    return res.json({
      success: true,
      message: "Listing removed",
    });
  } catch (err) {
    next(err);
  }
};
