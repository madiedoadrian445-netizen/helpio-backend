// src/routes/customerTimelineRoutes.js
import express from "express";
import { protect } from "../middleware/auth.js";
import {
  addTimelineEntry,
  getCustomerTimeline,
} from "../controllers/customerTimelineController.js";

const router = express.Router();

router.get("/:id/timeline", protect, getCustomerTimeline);
router.post("/:id/timeline", protect, addTimelineEntry);

export default router;
