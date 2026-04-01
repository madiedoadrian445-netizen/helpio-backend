// src/routes/terminalPaymentRoutes.js
import express from "express";
import { protect, admin } from "../middleware/auth.js";

import {
  createTerminalSession,
  authorizeTerminalPayment,
  captureTerminalPayment,
  cancelTerminalSession,
  getMyTerminalPayments,
  getTerminalPaymentById,
  adminListTerminalPayments,
  adminGetTerminalPayment
} from "../controllers/terminalPaymentController.js";
import TerminalPayment from "../models/TerminalPayment.js";
import LedgerEntry from "../models/LedgerEntry.js";


const router = express.Router();



/* -------------------------------------------------------
   TERMINAL SESSION LIFECYCLE
-------------------------------------------------------- */

router.post("/create-session", protect, createTerminalSession);
router.post("/authorize", protect, authorizeTerminalPayment);
router.post("/capture", protect, captureTerminalPayment);
router.post("/cancel", protect, cancelTerminalSession);



// ✅ ADD THIS BLOCK HERE
router.patch("/:id/attach-client", protect, async (req, res) => {
  try {
    const { id } = req.params;
    const { clientId } = req.body;

    const payment = await TerminalPayment.findById(id);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    payment.customer = clientId;
await payment.save();



// 🔥 ADD THIS (THIS IS THE FIX)
console.log("🧾 Creating ledger entry:", {
  provider: payment.provider,
  customer: clientId,
  amount: payment.amountCapturedCents,
});



// 🔥 UPDATE existing ledger entry (DO NOT CREATE NEW ONE)
if (payment.ledgerEntry) {
  await LedgerEntry.findByIdAndUpdate(payment.ledgerEntry, {
    customer: clientId,
  });
}



res.json({
  success: true,
  payment,
});


  } catch (err) {
   console.error("❌ attach-client error:", err.message, err.stack);
    res.status(500).json({
      success: false,
      message: "Failed to attach client",
    });
  }
});





/* -------------------------------------------------------
   ⭐ SIMULATED TAP-TO-PAY PAYMENT (Expo-safe)
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
