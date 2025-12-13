// src/routes/terminalPaymentSimRoutes.js
import express from "express";
import { logInfo } from "../utils/logger.js";
import { recordTerminalChargeLedger } from "../utils/ledger.js";

const router = express.Router();

/**
 * POST /api/terminal-payments-sim/simulate
 * Simulated Tap-to-Pay charge — Expo-safe, no Stripe keys required.
 */
router.post("/simulate", async (req, res) => {
  try {
    console.log("🔥 SIM ROUTE HIT", req.body);

    const { amount, currency = "usd", providerId, customerId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid amount is required for simulation.",
      });
    }

    const safeProviderId =
      providerId && typeof providerId === "string" ? providerId : null;

    const fakeId = "sim_" + Math.random().toString(36).substring(2, 12);

    const ledgerResult = await recordTerminalChargeLedger({
      providerId: safeProviderId,
      customerId: customerId || null,
      currency,                    // ✅ ADD THIS
      grossAmountCents: amount,
      trigger: "terminal_payment_simulated",
      simulated: true,
    });

    logInfo("terminal.simulated_payment", {
      requestId: req.requestId,
      providerId: safeProviderId,
      amount,
      currency,
      paymentIntentId: fakeId,
      ledgerEntryId: ledgerResult.entry?._id || null,
      skipped: ledgerResult.skipped || false, // ✅ ADD THIS
      mode: "simulated",
      source: "helpio_pay",
    });

    return res.json({
      success: true,
      simulated: true,
      skipped: ledgerResult.skipped || false, // ✅ ADD THIS
      paymentIntentId: fakeId,
      ledgerEntryId: ledgerResult.entry?._id || null,
      amount,
      currency,
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
