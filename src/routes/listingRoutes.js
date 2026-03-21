// src/routes/listingRoutes.js
import express from "express";
import { protect } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
import { fraudCheck } from "../middleware/fraudCheck.js";
import Listing from "../models/Listing.js";
import {
  createListing,
  updateListing,
  getAllListings,
  getListingsByCategory,
  getListingById,
  deleteListing,
} from "../controllers/listingController.js";

import { getFeed } from "../controllers/listingsFeedController.js";

const router = express.Router();

/* ============================================================
   PUBLIC ROUTES — NO AUTH REQUIRED
============================================================ */

// ⭐ FEED (must be BEFORE /:id)
router.get("/feed", getFeed);


//GET my listings (provider only)
router.get(
  "/provider/mine",
  protect,
  async (req, res) => {
    try {
      if (!req.user?.providerId) {
        return res.status(403).json({
          success: false,
          message: "Provider access required.",
        });
      }

      const listings = await Listing.find({
        provider: req.user.providerId,
      })
        .sort({ updatedAt: -1 })
        .lean();

      return res.json({
        success: true,
        listings,
      });
    } catch (err) {
      console.log("❌ getMyListings error:", err);
      return res.status(500).json({
        success: false,
        message: "Server error.",
      });
    }
  }
);

// GET public listings by provider
router.get("/provider/:providerId", async (req, res) => {
  try {
    const { providerId } = req.params;

    const listings = await Listing.find({
      provider: providerId,
    })
      .sort({ createdAt: -1 })
      .lean();

console.log("🔎 Listings found:", listings.length);

    return res.json({
      success: true,
      listings,
    });
  } catch (err) {
    console.log("❌ getProviderListings error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
});

//  GET listings by category
router.get("/category/:cat", getListingsByCategory);

//  GET all listings (with pagination + filters)
router.get("/", getAllListings);

// GET listing by ID
router.get("/:id", validateObjectId("id"), getListingById);



/* ============================================================
   PROVIDER ROUTES — AUTH + FRAUD CHECK REQUIRED
============================================================ */

// 4️⃣ CREATE listing
router.post(
  "/provider",
  protect,
  fraudCheck({ sourceType: "listing_create" }),
  createListing
);




// 5️⃣ UPDATE listing
router.put(
  "/provider/:id",
  protect,
  validateObjectId("id"),
  fraudCheck({ sourceType: "listing_update" }),
  updateListing
);

// 6️⃣ DELETE listing
router.delete(
  "/provider/:id",
  protect,
  validateObjectId("id"),
  fraudCheck({ sourceType: "listing_delete" }),
  deleteListing
);

export default router;
