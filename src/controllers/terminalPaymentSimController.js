import { logInfo } from "../utils/logger.js";
import { recordTerminalChargeLedger } from "../utils/ledger.js";

/**
 * Simulated Tap-to-Pay charge
 * NO Stripe
 * Provider OPTIONAL
 */
export const simulateTerminalPayment = async (req, res) => {
  try {
    const { amount, currency = "usd", providerId, customerId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid amount is required",
      });
    }

    const fakePaymentIntentId =
      "sim_" + Math.random().toString(36).substring(2, 12);

    // 🔑 CRITICAL: providerId CAN BE NULL
    const ledgerResult = await recordTerminalChargeLedger({
      providerId: providerId || null,
      customerId: customerId || null,
      terminalPaymentId: null,
      grossAmountCents: amount,
      trigger: "terminal_payment_simulated",
      simulated: true,
    });

    logInfo("terminal.simulated_payment", {
      providerId: providerId || null,
      amount,
      currency,
      paymentIntentId: fakePaymentIntentId,
      ledgerEntryId: ledgerResult.entry?._id || null,
    });

    return res.json({
      success: true,
      simulated: true,
      status: "succeeded",
      amount,
      currency,
      paymentIntentId: fakePaymentIntentId,
      ledgerEntryId: ledgerResult.entry?._id || null,
    });
  } catch (err) {
    console.error("❌ Simulated terminal payment failed:", err);
    return res.status(500).json({
      success: false,
      message: "Simulated payment failed",
    });
  }
};
