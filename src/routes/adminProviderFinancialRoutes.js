// src/routes/adminProviderFinancialRoutes.js
import express from "express";
import { protect, requireAdmin } from "../middleware/auth.js";
import { getProviderFinancialOverviewAdmin } from "../controllers/adminProviderFinancialController.js";

const router = express.Router();

/**
 * Admin Provider Financial Overview
 *
 * GET /api/admin/providers/:providerId/financial-overview
 */
router.get(
  "/providers/:providerId/financial-overview",
  protect,
  requireAdmin, // ⭐ REQUIRED for admin-only routes
  getProviderFinancialOverviewAdmin
);

export default router;
