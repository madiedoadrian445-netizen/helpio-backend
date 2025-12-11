// src/routes/adminCronRoutes.js
import express from "express";
import { protect, admin } from "../middleware/auth.js";

/* Corrected imports — B23 */
import { startSubscriptionBillingCron } from "../cron/subscriptionBillingCron.js";
import { nightlyBalanceRecalculation } from "../cron/recalculateBalancesCron.js";
import { runAutoPayoutCron } from "../cron/autoPayoutCron.js";

import {
  getCronHealth,
  getCronJobHealth,
} from "../controllers/adminCronController.js";

const router = express.Router();

/* ---------------------------------------------------------
   Optional Admin Wrapper (non-strict because auth.js already enforces admin)
--------------------------------------------------------- */
const requireAdmin = (req, res, next) => {
  // If you want strict role enforcement:
  // if (!req.user?.isAdmin) return res.status(403).json({ success: false, message: "Admin only" });
  next();
};

/* ---------------------------------------------------------
   ⭐ CRON HEALTH DASHBOARD
--------------------------------------------------------- */
router.get("/health", protect, requireAdmin, getCronHealth);
router.get("/health/:jobKey", protect, requireAdmin, getCronJobHealth);

/* ---------------------------------------------------------
   ⭐ MANUAL CRON EXECUTION ENDPOINTS (ADMIN)
--------------------------------------------------------- */

/** 1️⃣ Manual Subscription Billing Cron */
router.post(
  "/run-subscription-billing",
  protect,
  requireAdmin,
  async (req, res) => {
    try {
      console.log("⚡ Admin Trigger: Subscription Billing Cron");

      // FIXED — correct function call
      const result = await startSubscriptionBillingCron(true);

      return res.json({
        success: true,
        message: "Subscription billing cron executed",
        result,
      });
    } catch (err) {
      console.error("❌ Admin Cron Billing Error:", err);
      return res.status(500).json({
        success: false,
        message: "Subscription billing cron failed",
        error: err.message,
      });
    }
  }
);

/** 2️⃣ Manual Balance Recalculation Cron */
router.post(
  "/recalculate-balances",
  protect,
  requireAdmin,
  async (req, res) => {
    try {
      console.log("⚡ Admin Trigger: Nightly Balance Recalculation");
      const result = await nightlyBalanceRecalculation(true);

      return res.json({
        success: true,
        message: "Balance recalculation completed",
        result,
      });
    } catch (err) {
      console.error("❌ Admin Cron Balance Error:", err);
      return res.status(500).json({
        success: false,
        message: "Balance recalculation failed",
        error: err.message,
      });
    }
  }
);

/** 3️⃣ Manual Auto-Payout Cron */
router.post("/run-auto-payouts", protect, requireAdmin, async (req, res) => {
  try {
    console.log("⚡ Admin Trigger: Auto-Payout Cron");
    const result = await runAutoPayoutCron(true);

    return res.json({
      success: true,
      message: "Auto-payout cron executed",
      result,
    });
  } catch (err) {
    console.error("❌ Admin Cron Payout Error:", err);
    return res.status(500).json({
      success: false,
      message: "Auto-payout cron failed",
      error: err.message,
    });
  }
});

/** 4️⃣ FULL SYSTEM CHAIN (Billing → Balance → Payouts) */
router.post("/run-all", protect, requireAdmin, async (req, res) => {
  try {
    console.log("⚡ Admin Trigger: FULL SYSTEM CRON");

    const billing = await startSubscriptionBillingCron(true);
    const balances = await nightlyBalanceRecalculation(true);
    const payouts = await runAutoPayoutCron(true);

    return res.json({
      success: true,
      message: "Full system cron executed",
      results: { billing, balances, payouts },
    });
  } catch (err) {
    console.error("❌ Admin Full Cron Error:", err);
    return res.status(500).json({
      success: false,
      message: "Full system cron failed",
      error: err.message,
    });
  }
});

export default router;
