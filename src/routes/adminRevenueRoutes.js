// src/routes/adminRevenueRoutes.js
import express from "express";
import { protect } from "../middleware/auth.js";
import { getRevenueSummary } from "../controllers/adminRevenueController.js";

const router = express.Router();

/**
 * Admin Revenue Dashboard API
 *
 * GET /api/admin/revenue/summary
 *
 * Examples:
 *  - /api/admin/revenue/summary?range=today
 *  - /api/admin/revenue/summary?range=last7d
 *  - /api/admin/revenue/summary?range=mtd
 *  - /api/admin/revenue/summary?start=2025-01-01&end=2025-02-01
 */
router.get("/summary", protect, getRevenueSummary);

export default router;
