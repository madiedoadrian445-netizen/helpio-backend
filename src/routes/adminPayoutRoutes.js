import express from "express";
import { protect, admin } from "../middleware/auth.js";

import {
  adminListPayouts,
  adminGetPayout,
  adminMarkPayoutPaid,
  adminCancelPayout,
} from "../controllers/adminPayoutController.js";

import { runAutoPayoutCron } from "../cron/autoPayoutCron.js";

const router = express.Router();

/* --- Admin Browsing --- */
router.get("/", protect, admin, adminListPayouts);
router.get("/:payoutId", protect, admin, adminGetPayout);

/* --- Admin Actions --- */
router.post("/:payoutId/mark-paid", protect, admin, adminMarkPayoutPaid);
router.post("/:payoutId/cancel", protect, admin, adminCancelPayout);

/* --- Manual Cron Trigger --- */
router.post("/trigger/auto-payout", protect, admin, async (req, res) => {
  await runAutoPayoutCron();
  res.json({
    success: true,
    message: "Auto payout cron executed.",
  });
});

export default router;
