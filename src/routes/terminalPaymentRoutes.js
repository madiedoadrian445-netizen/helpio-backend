// src/routes/terminalPaymentRoutes.js
import express from "express";
import { protect, admin } from "../middleware/auth.js";

import {
  getMyTerminalPayments,
  getTerminalPaymentById,
  adminListTerminalPayments,
  adminGetTerminalPayment
} from "../controllers/terminalPaymentController.js";

const router = express.Router();

/* -------------------------------------------------------
   ⭐ SIMULATED TAP-TO-PAY PAYMENT (Expo-safe)
   Base: /api/terminal-payments/simulate
   This MUST be before ":id" routes.
-------------------------------------------------------- */
router.post("/simulate", async (req, res) => {
  try {
    const { amount, currency } = req.body;

    console.log("💳 [SIMULATED] Payment request:", req.body);

    return res.json({
      success: true,
      simulated: true,
      message: "Simulated payment processed",
      amount,
      currency,
    });
  } catch (err) {
    console.error("❌ Simulated payment error:", err);
    return res.status(500).json({
      success: false,
      message: "Simulated payment error",
    });
  }
});

/* -------------------------------------------------------
   PROVIDER ROUTES
   Base: /api/terminal-payments
-------------------------------------------------------- */

/**
 * Provider: List MY terminal payments
 * GET /api/terminal-payments/me
 */
router.get("/me", protect, getMyTerminalPayments);

/**
 * Alias: List MY terminal payments
 * GET /api/terminal-payments
 */
router.get("/", protect, getMyTerminalPayments);

/* -------------------------------------------------------
   ADMIN ROUTES
-------------------------------------------------------- */

/**
 * Admin: List ALL terminal payments
 * GET /api/terminal-payments/admin
 */
router.get("/admin", protect, admin, adminListTerminalPayments);

/**
 * Admin: Get terminal payment by ID
 * GET /api/terminal-payments/admin/:id
 */
router.get("/admin/:id", protect, admin, adminGetTerminalPayment);

/* -------------------------------------------------------
   PROVIDER: GET SINGLE PAYMENT — this must stay LAST
-------------------------------------------------------- */

/**
 * Provider: Get single terminal payment
 * GET /api/terminal-payments/:id
 */
router.get("/:id", protect, getTerminalPaymentById);

export default router;
