// src/routes/customerTimelineRoutes.js
import express from "express";
import { protect } from "../middleware/auth.js";
import {
  addTimelineEntry,
  getCustomerTimeline,
} from "../controllers/customerTimelineController.js";

const router = express.Router();

/**
 * IMPORTANT:
 * You are using "Client" as your customer model.
 * So your API path should use /clients, NOT /customers.
 *
 * Your frontend calls:
 *   GET /api/customers/:id/timeline
 *
 * But your model is "Client".
 * 
 * To keep EVERYTHING consistent:
 *   Use /api/clients   ← this matches your model + CRM architecture
 */

// ⭐ FIX — Use `/clients` instead of `/customers`
router.get("/:id/timeline", protect, getCustomerTimeline);
router.post("/:id/timeline", protect, addTimelineEntry);

export default router;
