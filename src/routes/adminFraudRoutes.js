// src/routes/adminFraudRoutes.js
import express from "express";
import { protect, requireAdmin } from "../middleware/auth.js";
import {
  listFraudEvents,
  getFraudSummary,
} from "../controllers/adminFraudController.js";

const router = express.Router();

/**
 * Fraud Events list (paginated)
 *
 * GET /api/admin/fraud/events
 */
router.get("/events", protect, requireAdmin, listFraudEvents);

/**
 * Fraud Summary (counts by level/action)
 *
 * GET /api/admin/fraud/summary
 */
router.get("/summary", protect, requireAdmin, getFraudSummary);

export default router;
