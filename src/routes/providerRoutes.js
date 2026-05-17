// src/routes/providerRoutes.js
import express from "express";
import {
  createProvider,
  updateProvider,
  updateProviderById,
  uploadProviderImage,
  uploadMiddleware,
  getMyProviderProfile,
  getAllProviders,
  getProviderById,
} from "../controllers/providerController.js";

import { protect } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();

/* -------------------------------------------------------
   AUTHENTICATED ROUTES
-------------------------------------------------------- */

// Create a new provider profile for the logged-in user
router.post("/", protect, createProvider);

// Update my provider profile (find by auth user, not ID)
router.put("/", protect, updateProvider);

// Get my own provider profile
router.get("/me", protect, getMyProviderProfile);

/* -------------------------------------------------------
   PROVIDER PROFILE EDIT BY ID  ← NEW
   The EditProviderProfileScreen calls PATCH /:id.
   Ownership is verified inside the controller.
-------------------------------------------------------- */
router.patch(
  "/:id",
  protect,
  validateObjectId("id"),
  updateProviderById
);

/* -------------------------------------------------------
   PROVIDER IMAGE UPLOAD  ← NEW
   POST /api/providers/:id/upload
   field body param: "avatar" → logoUrl
                     "cover"  → coverImageUrl
   uploadMiddleware runs multer before the controller
   so req.file is ready when uploadProviderImage runs.
-------------------------------------------------------- */
router.post(
  "/:id/upload",
  protect,
  validateObjectId("id"),
  uploadMiddleware,
  uploadProviderImage
);

/* -------------------------------------------------------
   PUBLIC ROUTES
   These must come AFTER all specific routes so that
   strings like "me" or "upload" are never matched as IDs.
-------------------------------------------------------- */
router.get("/", getAllProviders);
router.get("/:id", validateObjectId("id"), getProviderById);

export default router;