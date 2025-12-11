// src/routes/adminAuthSecurityRoutes.js
import express from "express";
import { protect } from "../middleware/auth.js";
import {
  getAuthSecuritySummary,
  getAuthEvents,
  getUserAuthTimeline,
} from "../controllers/adminAuthSecurityController.js";

const router = express.Router();

/**
 * All routes here are:
 *  - protected (must be logged in)
 *  - admin-only (checked inside the controller)
 */

router.use(protect);

/* -----------------------------------------------------------
   SUMMARY: /api/admin/auth-security/summary
----------------------------------------------------------- */
router.get("/summary", getAuthSecuritySummary);

/* -----------------------------------------------------------
   EVENTS LIST: /api/admin/auth-security/events
----------------------------------------------------------- */
router.get("/events", getAuthEvents);

/* -----------------------------------------------------------
   USER TIMELINE: /api/admin/auth-security/user/:userId
----------------------------------------------------------- */
router.get("/user/:userId", getUserAuthTimeline);

export default router;
