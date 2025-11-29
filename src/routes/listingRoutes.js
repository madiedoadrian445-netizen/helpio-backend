import express from "express";
import {
  createListing,
  updateListing,
  getAllListings,
  getListingsByCategory,
  getListingById,
  deleteListing,
} from "../controllers/listingController.js";
import { protect } from "../middleware/authMiddleware.js";


const router = express.Router();

// Public routes
router.get("/", getAllListings);
router.get("/:id", getListingById);
router.get("/category/:cat", getListingsByCategory);

// Protected actions
router.post("/", protect, createListing);
router.put("/:id", protect, updateListing);
router.delete("/:id", protect, deleteListing);

export default router;
