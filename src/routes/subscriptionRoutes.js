// routes/subscriptionRoutes.js
import express from "express";
import { protect } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

import {
  createSubscription,
  getMySubscriptions,
  getSubscriptionById,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
  getSubscriptionCharges,
  chargeSubscriptionNow,
} from "../controllers/subscriptionController.js";

import { auditLog } from "../utils/auditLogger.js";

const router = express.Router();

/* -------------------------------------------------------
   CREATE + LIST
------------------------------------------------------- */
router.post("/", protect, async (req, res, next) => {
  try {
    const result = await createSubscription(req, res);

    // 🔐 Audit Log
    auditLog({
      user: req.user._id,
      provider: req.user.provider,
      action: "subscription_created",
      entity: "subscription",
      entityId: result?.subscription?._id,
      metadata: { body: req.body },
    });

    return result;
  } catch (err) {
    next(err);
  }
});

router.get("/my", protect, getMySubscriptions);

/* -------------------------------------------------------
   ACTION ROUTES (must be before /:id)
------------------------------------------------------- */

// ⭐ Charge subscription now
router.post(
  "/:id/charge",
  protect,
  validateObjectId("id"),
  async (req, res, next) => {
    try {
      const result = await chargeSubscriptionNow(req, res);

      auditLog({
        user: req.user._id,
        provider: req.user.provider,
        action: "subscription_charged_now",
        entity: "subscription",
        entityId: req.params.id,
        metadata: { reason: "manual_charge" },
      });

      return result;
    } catch (err) {
      next(err);
    }
  }
);

// ⭐ Pause subscription
router.post(
  "/:id/pause",
  protect,
  validateObjectId("id"),
  async (req, res, next) => {
    try {
      const result = await pauseSubscription(req, res);

      auditLog({
        user: req.user._id,
        provider: req.user.provider,
        action: "subscription_paused",
        entity: "subscription",
        entityId: req.params.id,
      });

      return result;
    } catch (err) {
      next(err);
    }
  }
);

// ⭐ Resume subscription
router.post(
  "/:id/resume",
  protect,
  validateObjectId("id"),
  async (req, res, next) => {
    try {
      const result = await resumeSubscription(req, res);

      auditLog({
        user: req.user._id,
        provider: req.user.provider,
        action: "subscription_resumed",
        entity: "subscription",
        entityId: req.params.id,
      });

      return result;
    } catch (err) {
      next(err);
    }
  }
);

// ⭐ Cancel subscription
router.post(
  "/:id/cancel",
  protect,
  validateObjectId("id"),
  async (req, res, next) => {
    try {
      const result = await cancelSubscription(req, res);

      auditLog({
        user: req.user._id,
        provider: req.user.provider,
        action: "subscription_cancelled",
        entity: "subscription",
        entityId: req.params.id,
      });

      return result;
    } catch (err) {
      next(err);
    }
  }
);

// ⭐ Fetch subscription charges
router.get(
  "/:id/charges",
  protect,
  validateObjectId("id"),
  async (req, res, next) => {
    try {
      const result = await getSubscriptionCharges(req, res);

      auditLog({
        user: req.user._id,
        provider: req.user.provider,
        action: "subscription_charges_viewed",
        entity: "subscription",
        entityId: req.params.id,
      });

      return result;
    } catch (err) {
      next(err);
    }
  }
);

/* -------------------------------------------------------
   GET SINGLE SUBSCRIPTION — must remain last
------------------------------------------------------- */
router.get(
  "/:id",
  protect,
  validateObjectId("id"),
  async (req, res, next) => {
    try {
      const result = await getSubscriptionById(req, res);

      auditLog({
        user: req.user._id,
        provider: req.user.provider,
        action: "subscription_viewed",
        entity: "subscription",
        entityId: req.params.id,
      });

      return result;
    } catch (err) {
      next(err);
    }
  }
);

export default router;
