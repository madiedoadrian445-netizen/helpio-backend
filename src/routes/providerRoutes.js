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

const router = express.Router();

// Create provider profile
router.post("/", protect, createProvider);

// Update provider
router.put("/", protect, updateProvider);

// Get your own provider profile
router.get("/me", protect, getMyProviderProfile);

// Public: get all providers
router.get("/", getAllProviders);

// Public: get provider by ID
router.get("/:id", getProviderById);

export default router;
