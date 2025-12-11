// src/routes/listingRoutes.js
import express from "express";
import { protect } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
import { fraudCheck } from "../middleware/fraudCheck.js";

import {
  createListing,
  updateListing,
  getAllListings,
  getListingsByCategory,
  getListingById,
  deleteListing,
} from "../controllers/listingController.js";

const router = express.Router();

/* ============================================================
   PUBLIC ROUTES — NO AUTH REQUIRED
============================================================ */

// 1️⃣ GET all listings (with pagination + filters)
router.get("/", getAllListings);

// 2️⃣ GET listings by category
router.get("/category/:cat", getListingsByCategory);

// 3️⃣ GET listing by ID
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
