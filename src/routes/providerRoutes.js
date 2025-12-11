// src/routes/providerRoutes.js
import express from "express";
import {
  createProvider,
  updateProvider,
  getMyProviderProfile,
  getAllProviders,
  getProviderById,
} from "../controllers/providerController.js";

import { protect } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

const router = express.Router();

/* -------------------------------------------------------
   PROVIDER CRUD (Requires authentication)
-------------------------------------------------------- */
router.post("/", protect, createProvider);
router.put("/", protect, updateProvider);
router.get("/me", protect, getMyProviderProfile);

/* -------------------------------------------------------
   PUBLIC ROUTES
   Anyone can browse providers
-------------------------------------------------------- */
router.get("/", getAllProviders);

/* -------------------------------------------------------
   MUST ALWAYS BE LAST
   Prevents route collisions with /me or other static routes
-------------------------------------------------------- */
router.get("/:id", validateObjectId("id"), getProviderById);

export default router;
