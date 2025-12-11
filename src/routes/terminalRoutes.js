// src/routes/terminalRoutes.js
import express from "express";
import { protect } from "../middleware/auth.js";
import { fraudCheck } from "../middleware/fraudCheck.js";
import { auditLog } from "../utils/auditLogger.js";

import {
  discoverReaders,
  connectReader,
  createTerminalPaymentIntent,
  processTerminalPayment,
  captureTerminalPayment,
  chargeInvoiceTerminal,
  chargeSubscriptionTerminal,
} from "../controllers/terminalController.js";

const router = express.Router();

// Ensure all requests are JSON & small (protects against payload flooding)
router.use(express.json({ limit: "1mb" }));

/**
 * All Helpio Pay Terminal routes require:
 *  - Logged-in user
 *  - FraudCheck middleware (for telemetry + threat detection)
 */

/* -------------------------------------------------------
   🔍 Discover Readers
------------------------------------------------------- */
router.get("/readers", protect, async (req, res, next) => {
  try {
    const result = await discoverReaders(req, res);

    auditLog({
      user: req.user._id,
      provider: req.user.provider,
      action: "terminal_readers_discovered",
      entity: "terminal",
    });

    return result;
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------
   🔌 Connect Reader (Simulated Mode Only)
------------------------------------------------------- */
router.post("/connect", protect, async (req, res, next) => {
  try {
    const result = await connectReader(req, res);

    auditLog({
      user: req.user._id,
      provider: req.user.provider,
      action: "terminal_reader_connected",
      entity: "terminal_reader",
      metadata: { readerId: result?.readerId },
    });

    return result;
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------
   💳 Create Terminal PaymentIntent (Tap to Pay)
------------------------------------------------------- */
router.post(
  "/payment-intents",
  protect,
  fraudCheck({ sourceType: "terminal" }),
  async (req, res, next) => {
    try {
      const result = await createTerminalPaymentIntent(req, res);

      auditLog({
        user: req.user._id,
        provider: req.user.provider,
        action: "terminal_payment_intent_created",
        entity: "payment_intent",
        entityId: result?.paymentIntent?.id,
        metadata: { amount: req.body.amount },
      });

      return result;
    } catch (err) {
      next(err);
    }
  }
);

/* -------------------------------------------------------
   📱 Process Tap Action (Simulated)
------------------------------------------------------- */
router.post(
  "/process-payment",
  protect,
  fraudCheck({ sourceType: "terminal_tap" }),
  async (req, res, next) => {
    try {
      const result = await processTerminalPayment(req, res);

      auditLog({
        user: req.user._id,
        provider: req.user.provider,
        action: "terminal_payment_processed",
        entity: "payment_intent",
        entityId: result?.paymentIntent?.id,
      });

      return result;
    } catch (err) {
      next(err);
    }
  }
);

/* -------------------------------------------------------
   🏁 Capture Terminal PaymentIntent
------------------------------------------------------- */
router.post(
  "/capture",
  protect,
  fraudCheck({ sourceType: "terminal_capture" }),
  async (req, res, next) => {
    try {
      const result = await captureTerminalPayment(req, res);

      auditLog({
        user: req.user._id,
        provider: req.user.provider,
        action: "terminal_payment_captured",
        entity: "payment_intent",
        entityId: result?.paymentIntent?.id,
      });

      return result;
    } catch (err) {
      next(err);
    }
  }
);

/* -------------------------------------------------------
   💸 Charge Outstanding Invoice via Terminal
------------------------------------------------------- */
router.post(
  "/charge-invoice",
  protect,
  fraudCheck({ sourceType: "terminal_invoice" }),
  async (req, res, next) => {
    try {
      const result = await chargeInvoiceTerminal(req, res);

      auditLog({
        user: req.user._id,
        provider: req.user.provider,
        action: "terminal_invoice_charge",
        entity: "invoice",
        entityId: result?.invoiceId,
        metadata: { amount: req.body.amount },
      });

      return result;
    } catch (err) {
      next(err);
    }
  }
);

/* -------------------------------------------------------
   🧾 Charge Subscription via Terminal (Plan Renewal)
------------------------------------------------------- */
router.post(
  "/charge-subscription",
  protect,
  fraudCheck({ sourceType: "terminal_subscription" }),
  async (req, res, next) => {
    try {
      const result = await chargeSubscriptionTerminal(req, res);

      auditLog({
        user: req.user._id,
        provider: req.user.provider,
        action: "terminal_subscription_charge",
        entity: "subscription",
        entityId: result?.subscriptionId,
        metadata: { amount: req.body.amount },
      });

      return result;
    } catch (err) {
      next(err);
    }
  }
);

export default router;
