import express from "express";
import {
  createProvider,
  updateProvider,
  getMyProviderProfile,
  getAllProviders,
  getProviderById,
} from "../controllers/providerController.js";

import { protect } from "../middleware/auth.js";
import { getDashboardStats } from "../controllers/crmDashboardController.js";

const router = express.Router();

/* Debug test route */
router.get("/__routes_check", (req, res) => {
  res.json({
    ok: true,
    message: "THIS IS THE REAL providerRoutes.js",
    timestamp: Date.now()
  });
});

/* CRM must be first */
router.get("/crm/dashboard", protect, getDashboardStats);

router.post("/", protect, createProvider);
router.put("/", protect, updateProvider);
router.get("/me", protect, getMyProviderProfile);

router.get("/", getAllProviders);

router.get("/:id", getProviderById);

export default router;
