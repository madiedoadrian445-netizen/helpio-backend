// src/routes/payoutRoutes.js
import express from "express";
import { protect } from "../middleware/auth.js";
import { fraudCheck } from "../middleware/fraudCheck.js";
import { auditLog } from "../utils/auditLogger.js";

import {
  requestPayout,
  getPayoutHistory,
  getMyBalance,
  getPayoutDashboard,
  getPayoutAnalytics,
} from "../controllers/payoutController.js";

const router = express.Router();

/**
 * Provider-level payout routes
 */

/* -------------------------------------------------------
   🧾 REQUEST PAYOUT (HIGH RISK)
   → fraudCheck + auditLog
------------------------------------------------------- */
router.post(
  "/request",
  protect,
  fraudCheck({ sourceType: "payout" }),
  async (req, res, next) => {
    try {
      const result = await requestPayout(req, res);

      // 🔐 Audit the payout request
      auditLog({
        user: req.user._id,
        provider: req.user.provider,
        action: "payout_requested",
        entity: "payout",
        entityId: result?.payout?._id,
        metadata: {
          amountDollars: req.body.amountDollars,
          currency: req.body.currency || "usd",
        },
      });

      return result;
    } catch (err) {
      next(err);
    }
  }
);

/* -------------------------------------------------------
   📊 PROVIDER PAYOUT DASHBOARD (read only)
------------------------------------------------------- */
router.get(
  "/dashboard",
  protect,
  async (req, res, next) => {
    try {
      const result = await getPayoutDashboard(req, res);

      auditLog({
        user: req.user._id,
        provider: req.user.provider,
        action: "payout_dashboard_viewed",
        entity: "payout_dashboard",
      });

      return result;
    } catch (err) {
      next(err);
    }
  }
);

/* -------------------------------------------------------
   📈 PAYOUT ANALYTICS (read only)
------------------------------------------------------- */
router.get(
  "/analytics",
  protect,
  async (req, res, next) => {
    try {
      const result = await getPayoutAnalytics(req, res);

      auditLog({
        user: req.user._id,
        provider: req.user.provider,
        action: "payout_analytics_viewed",
        entity: "payout_analytics",
      });

      return result;
    } catch (err) {
      next(err);
    }
  }
);

/* -------------------------------------------------------
   📜 PAYOUT HISTORY (read only)
------------------------------------------------------- */
router.get(
  "/history",
  protect,
  async (req, res, next) => {
    try {
      const result = await getPayoutHistory(req, res);

      auditLog({
        user: req.user._id,
        provider: req.user.provider,
        action: "payout_history_viewed",
        entity: "payout_history",
      });

      return result;
    } catch (err) {
      next(err);
    }
  }
);

/* -------------------------------------------------------
   💼 PROVIDER BALANCE (read only)
------------------------------------------------------- */
router.get(
  "/balance",
  protect,
  async (req, res, next) => {
    try {
      const result = await getMyBalance(req, res);

      auditLog({
        user: req.user._id,
        provider: req.user.provider,
        action: "provider_balance_viewed",
        entity: "provider_balance",
      });

      return result;
    } catch (err) {
      next(err);
    }
  }
);

export default router;
