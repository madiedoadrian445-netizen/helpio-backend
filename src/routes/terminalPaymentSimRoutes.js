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

    if (!providerId) {
      return res.status(400).json({
        success: false,
        message: "providerId is required for simulated revenue.",
      });
    }

    const fakeId = "sim_" + Math.random().toString(36).substring(2, 12);

    /* -------------------------------
       LEDGER ENTRY (THIS IS THE KEY)
    -------------------------------- */
    const ledgerResult = await recordTerminalChargeLedger({
      providerId,
      customerId: customerId || null,
      terminalPaymentId: null,
      grossAmountCents: amount,
      trigger: "terminal_payment_simulated",
    });

    /* -------------------------------
       STRUCTURED LOG
    -------------------------------- */
    logInfo("terminal.simulated_payment", {
      requestId: req.requestId,
      providerId,
      amount,
      currency,
      paymentIntentId: fakeId,
      ledgerEntryId: ledgerResult.entry?._id || null,
      mode: "simulated",
      source: "helpio_pay",
    });

    return res.json({
      success: true,
      simulated: true,
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
