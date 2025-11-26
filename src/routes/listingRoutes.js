// src/routes/listingRoutes.js
import express from "express";
import {
  createListing,
  updateListing,
  getAllListings,
  getListingsByCategory,
  getListingById,
  deleteListing,
} from "../controllers/listingController.js";

import { protect } from "../middleware/auth.js";

const router = express.Router();

// Protected: Create listing
router.post("/", protect, createListing);

// Protected: Update listing
router.put("/:id", protect, updateListing);

// Protected: Delete listing
router.delete("/:id", protect, deleteListing);

// Public: Fetch listings
router.get("/", getAllListings);

// Public: category filtering
router.get("/category/:cat", getListingsByCategory);

// Public: get specific listing
router.get("/:id", getListingById);

export default router;
