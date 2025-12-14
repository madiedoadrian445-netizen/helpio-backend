// src/routes/customerTimelineRoutes.js

import express from "express";
import { protect } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

import {
  addTimelineEntry,
  getTimeline,
} from "../controllers/customerTimelineController.js";

const router = express.Router();

/* -------------------------------------------------------
   CUSTOMER TIMELINE ROUTES (Provider Scoped)

   GET  /api/customers/:customerId/timeline
   POST /api/customers/:customerId/timeline
-------------------------------------------------------- */

/**
 * Get timeline for a specific customer
 * Returns paginated, provider-scoped activity
 */
router.get(
  "/:customerId/timeline",
  protect,
  validateObjectId("customerId"),
  getTimeline
);

/**
 * Add a timeline entry for a customer
 * Used by invoices, subscriptions, notes, etc.
 */
router.post(
  "/:customerId/timeline",
  protect,
  validateObjectId("customerId"),
  addTimelineEntry
);

export default router;
