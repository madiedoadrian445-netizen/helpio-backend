// src/routes/terminalPaymentSimRoutes.js
import express from "express";

const router = express.Router();

/**
 * POST /api/terminal-payments-sim/simulate
 * Simulated Tap-to-Pay charge — Expo-safe, no Stripe keys required.
 */
router.post("/simulate", async (req, res) => {
  try {
    const { amount, currency } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid amount is required for simulation.",
      });
    }

    const fakeId = "sim_" + Math.random().toString(36).substring(2, 12);

    console.log("💳 Simulated Tap-to-Pay", {
      amount,
      currency,
      fakeId,
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
