// src/routes/adminPayoutDashboardRoutes.js
import express from "express";
import { protect, admin } from "../middleware/auth.js";

import {
  getAdminPayoutOverview,
  getAdminPayoutList,
  getAdminPayoutById,
  getDailyPayoutStats,
  getTopPayoutProviders,
} from "../controllers/payoutDashboardController.js";

const router = express.Router();

/* -------------------------------------------------------
   BASE: /api/admin/payouts
   ONLY ADMIN ACCESS
-------------------------------------------------------- */

// 📊 High-level payout overview
router.get("/overview", protect, admin, getAdminPayoutOverview);

// 📜 Full payout list (filtered & paginated)
router.get("/list", protect, admin, getAdminPayoutList);

// 🔍 Single payout detail
router.get("/:id", protect, admin, getAdminPayoutById);

// 📈 Daily payout statistics (chart API)
router.get("/stats/daily", protect, admin, getDailyPayoutStats);

// 🏆 Top providers by payout volume
router.get("/stats/providers", protect, admin, getTopPayoutProviders);

export default router;
