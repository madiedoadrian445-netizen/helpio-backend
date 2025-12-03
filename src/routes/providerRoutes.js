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

/* -----------------------------
   PROVIDER CRUD
------------------------------ */
router.post("/", protect, createProvider);
router.put("/", protect, updateProvider);
router.get("/me", protect, getMyProviderProfile);

/* -----------------------------
   PUBLIC ROUTES
------------------------------ */
router.get("/", getAllProviders);

/* -----------------------------
   MUST ALWAYS BE LAST
------------------------------ */
router.get("/:id", getProviderById);

export default router;
