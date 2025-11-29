// src/controllers/listingController.js
import { Listing } from "../models/Listing.js";

export const getAllListings = async (req, res) => {
  try {
    const listings = await Listing.find().sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      listings,
    });

  } catch (error) {
    console.error("🔥 GET ALL LISTINGS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching listings",
    });
  }
};

export const getListingById = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found",
      });
    }

    return res.status(200).json({
      success: true,
      listing,
    });

  } catch (error) {
    console.error("🔥 GET LISTING BY ID ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching listing",
    });
  }
};

export const getListingsByCategory = async (req, res) => {
  try {
    const listings = await Listing.find({
      category: { $regex: req.params.cat, $options: "i" },
    });

    return res.status(200).json({
      success: true,
      listings,
    });

  } catch (error) {
    console.error("🔥 CATEGORY LISTINGS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching category listings",
    });
  }
};

export const createListing = async (req, res) => {
  try {
    console.log("📥 Incoming BODY:", req.body);

    const {
      title,
      description,
      price,
      category,
      images,
      location,
    } = req.body;

    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: "Provider authentication required",
      });
    }

    const listing = await Listing.create({
      provider: req.user._id,             // logged in user
      title,
      description,
      price,
      category,
      images: images || [],
      location: {
        city: location?.city || "",
        state: location?.state || "",
        country: location?.country || "",
      },
      isActive: true,
      views: 0,
      favorites: 0,
    });

    console.log("✅ LISTING STORED IN DB:", listing);

    return res.status(201).json({
      success: true,
      listing,        // <<< THIS WAS MISSING BEFORE
    });

  } catch (error) {
    console.error("🔥 CREATE LISTING ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error creating listing",
    });
  }
};

export const updateListing = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found",
      });
    }

    if (listing.provider.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to edit this listing",
      });
    }

    const updated = await Listing.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    return res.status(200).json({
      success: true,
      listing: updated,
    });

  } catch (error) {
    console.error("🔥 UPDATE LISTING ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error updating listing",
    });
  }
};

export const deleteListing = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found",
      });
    }

    if (listing.provider.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this listing",
      });
    }

    await listing.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Listing deleted",
    });

  } catch (error) {
    console.error("🔥 DELETE LISTING ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error deleting listing",
    });
  }
};
