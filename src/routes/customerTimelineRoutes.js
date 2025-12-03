// src/routes/customerTimelineRoutes.js
import express from "express";
import { protect } from "../middleware/auth.js";
import {
  addTimelineEntry,
  getCustomerTimeline,
} from "../controllers/customerTimelineController.js";

const router = express.Router();

/**
 * Correct timeline endpoints:
 *   GET  /api/customers/:id/timeline
 *   POST /api/customers/:id/timeline
 */

router.get("/:id/timeline", protect, getCustomerTimeline);
router.post("/:id/timeline", protect, addTimelineEntry);

export default router;
