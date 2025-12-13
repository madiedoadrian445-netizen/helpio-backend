// src/routes/terminalPaymentSimRoutes.js
import express from "express";
import { logInfo } from "../utils/logger.js";

const router = express.Router();

/**
 * POST /api/terminal-payments-sim/simulate
 * Simulated Tap-to-Pay charge — Expo-safe, no Stripe keys required.
 */
router.post("/simulate", async (req, res) => {
  try {
    console.log("🔥 SIM ROUTE HIT", req.body);

    const { amount, currency } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid amount is required for simulation.",
      });
    }

    const fakeId = "sim_" + Math.random().toString(36).substring(2, 12);

    logInfo("terminal.simulated_payment", {
      requestId: req.requestId,
      amount,
      currency: currency || "usd",
      paymentIntentId: fakeId,
      mode: "simulated",
      source: "helpio_pay",
    });

    return res.json({
      success: true,
      simulated: true,
      paymentIntentId: fakeId,
      amount,
      currency: currency || "usd",
      status: "succeeded",
    });
  } catch (err) {
    console.log("❌ Simulated payment error:", err);
    return res.status(500).json({
      success: false,
      message: "Simulation failed.",
    });
  }
});

export default router;
