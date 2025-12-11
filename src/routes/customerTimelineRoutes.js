// src/routes/customerTimelineRoutes.js
import express from "express";
import { protect } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

import {
  addTimelineEntry,
  getTimeline, // ✅ FIXED: matches controller export
} from "../controllers/customerTimelineController.js";

const router = express.Router();

/* -------------------------------------------------------
   TIMELINE ROUTES (Provider Scoped)
   GET  /api/customers/:id/timeline
   POST /api/customers/:id/timeline
-------------------------------------------------------- */
router.get(
  "/:id/timeline",
  protect,
  validateObjectId("id"),
  getTimeline // ✅ FIXED: function name updated
);

router.post(
  "/:id/timeline",
  protect,
  validateObjectId("id"),
  addTimelineEntry
);

export default router;
