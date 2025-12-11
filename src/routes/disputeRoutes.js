// src/routes/disputeRoutes.js
import express from "express";
import { protect, admin } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

/* ⭐ NEW — LIMITERS (B10 hardened) */
import {
  helpioPayLimiter,
  strictAdminLimiter,
} from "../middleware/helpioPayLimiter.js";

import {
  getMyDisputes,
  getMyDisputeById,
  getAdminDisputes,
  getAdminDisputeById,
  markDisputeWon,
  markDisputeLost,
} from "../controllers/disputeController.js";

const router = express.Router();

/* -------------------------------------------------------
   PROVIDER ROUTES
   Base: /api/disputes
-------------------------------------------------------- */

/**
 * GET /api/disputes/me
 * Provider: list THEIR disputes
 */
router.get("/me", protect, helpioPayLimiter, getMyDisputes);

/**
 * GET /api/disputes/me/:disputeId
 * Provider: view a single dispute
 */
router.get(
  "/me/:disputeId",
  protect,
  helpioPayLimiter,
  validateObjectId("disputeId"),
  getMyDisputeById
);

/* -------------------------------------------------------
   ADMIN ROUTES
   Base: /api/disputes/admin
-------------------------------------------------------- */

/**
 * GET /api/disputes/admin
 * Admin: list ALL disputes
 */
router.get("/admin", protect, admin, strictAdminLimiter, getAdminDisputes);

/**
 * GET /api/disputes/admin/:disputeId
 * Admin: get 1 dispute
 */
router.get(
  "/admin/:disputeId",
  protect,
  admin,
  strictAdminLimiter,
  validateObjectId("disputeId"),
  getAdminDisputeById
);

/**
 * POST /api/disputes/admin/:disputeId/mark-won
 */
router.post(
  "/admin/:disputeId/mark-won",
  protect,
  admin,
  strictAdminLimiter,
  validateObjectId("disputeId"),
  markDisputeWon
);

/**
 * POST /api/disputes/admin/:disputeId/mark-lost
 */
router.post(
  "/admin/:disputeId/mark-lost",
  protect,
  admin,
  strictAdminLimiter,
  validateObjectId("disputeId"),
  markDisputeLost
);

export default router;
