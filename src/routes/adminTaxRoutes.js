// src/routes/adminTaxRoutes.js
import express from "express";
import { protect, requireAdmin } from "../middleware/auth.js";
import { getTaxSummary } from "../controllers/adminTaxController.js";

const router = express.Router();

/**
 * Admin Tax Reporting API
 *
 * GET /api/admin/tax/summary
 *
 * Examples:
 *  - /api/admin/tax/summary?range=today
 *  - /api/admin/tax/summary?range=last7d
 *  - /api/admin/tax/summary?range=mtd
 *  - /api/admin/tax/summary?range=ytd
 *  - /api/admin/tax/summary?start=2025-01-01&end=2025-02-01
 *  - /api/admin/tax/summary?range=mtd&includeProviders=true
 */
router.get("/summary", protect, getTaxSummary);

export default router;
