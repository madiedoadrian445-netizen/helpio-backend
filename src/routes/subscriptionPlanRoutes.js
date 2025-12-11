// routes/subscriptionPlanRoutes.js
import express from "express";
import { protect } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

import {
  createSubscriptionPlan,
  getMySubscriptionPlans,
  getSubscriptionPlanById,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  getPlanSubscribers,
  getPlanUpcomingCharges,
  getPlanActivity,
  getPlanAnalytics,
  getSubscriptionPlanDetails,
} from "../controllers/subscriptionPlanController.js";

const router = express.Router();

/* ---------------------------------------------------------
   CREATE + LIST PLANS
   -------------------------------------------------------- */

// Create a new subscription plan (provider-scoped)
router.post("/", protect, createSubscriptionPlan);

// Get all plans for the logged-in provider
router.get("/my", protect, getMySubscriptionPlans);

/* ---------------------------------------------------------
   EXTENDED PLAN DATA (MUST COME BEFORE /:id)
   -------------------------------------------------------- */

// Full combined plan details (plan + subs + upcoming + activity)
router.get(
  "/:id/details",
  protect,
  validateObjectId("id"),
  getSubscriptionPlanDetails
);

// Subscribers of this plan
router.get(
  "/:id/subscribers",
  protect,
  validateObjectId("id"),
  getPlanSubscribers
);

// Upcoming renewals for this plan
router.get(
  "/:id/upcoming-charges",
  protect,
  validateObjectId("id"),
  getPlanUpcomingCharges
);

// Recent plan activity (charges)
router.get(
  "/:id/activity",
  protect,
  validateObjectId("id"),
  getPlanActivity
);

// Analytics (MRR, ARR, counts)
router.get(
  "/:id/analytics",
  protect,
  validateObjectId("id"),
  getPlanAnalytics
);

/* ---------------------------------------------------------
   CRUD ROUTES — MUST BE LAST
   Prevent collisions with `/details`, `/activity`, etc.
   -------------------------------------------------------- */

// Get raw subscription plan
router.get(
  "/:id",
  protect,
  validateObjectId("id"),
  getSubscriptionPlanById
);

// Update subscription plan
router.put(
  "/:id",
  protect,
  validateObjectId("id"),
  updateSubscriptionPlan
);

// Delete subscription plan
router.delete(
  "/:id",
  protect,
  validateObjectId("id"),
  deleteSubscriptionPlan
);

export default router;
