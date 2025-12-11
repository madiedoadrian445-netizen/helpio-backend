// src/routes/adminDashboardRoutes.js
import express from "express";
import { protect } from "../middleware/auth.js";
import { getAdminDashboard } from "../controllers/adminDashboardController.js";

const router = express.Router();

/**
 * Admin SuperDashboard Aggregator
 *
 * GET /api/admin/dashboard
 */
router.get("/", protect, getAdminDashboard);

export default router;
