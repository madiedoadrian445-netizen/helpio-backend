import express from "express";
import { protect } from "../middleware/auth.js";

import {
  getProviderDashboardSummary,
  getProviderDashboardGraph,
  getProviderRecentPayouts,
} from "../controllers/providerPayoutDashboardController.js";

const router = express.Router();

router.get("/summary", protect, getProviderDashboardSummary);
router.get("/graph", protect, getProviderDashboardGraph);
router.get("/recent", protect, getProviderRecentPayouts);

export default router;
