// src/controllers/terminalController.js
import { asyncHandler } from "../middleware/asyncHandler.js";

import {
  doDiscoverReaders,
  doConnectReader,
  createGenericTerminalPaymentIntent,
  createInvoiceTerminalIntent,
  createSubscriptionTerminalIntent,
  processSimulatedTapToPay,
} from "../services/helpioPay/terminalIntentService.js";

import { captureTerminalPaymentService } from "../services/helpioPay/terminalCaptureService.js";

const sendError = (res, statusCode, message) =>
  res.status(statusCode).json({ success: false, message });

/* --------------------------------------------------
   DISCOVER TERMINAL READERS — HELPIO PAY
-------------------------------------------------- */
export const discoverReaders = asyncHandler(async (req, res) => {
  const result = await doDiscoverReaders();
  return res.json({ success: true, ...result });
});

/* --------------------------------------------------
   CONNECT READER (Helpio Pay branding)
-------------------------------------------------- */
export const connectReader = asyncHandler(async (req, res) => {
  const { readerId } = req.body;

  try {
    const result = await doConnectReader(readerId);
    return res.json({ success: true, ...result });
  } catch (err) {
    const status = err.statusCode || 400;
    return sendError(res, status, err.message || "Failed to connect reader.");
  }
});

/* --------------------------------------------------
   CREATE TERMINAL PAYMENT INTENT — HELPIO PAY
   (Generic / standalone)
-------------------------------------------------- */
export const createTerminalPaymentIntent = asyncHandler(
  async (req, res) => {
    const {
      amount,
      currency,
      invoiceId,
      subscriptionId,
      description,
      captureMethod,
      idempotencyKey,
    } = req.body;

    try {
      const result = await createGenericTerminalPaymentIntent({
        amount,
        currency,
        invoiceId,
        subscriptionId,
        description,
        captureMethod,
        idempotencyKey,
      });

      return res.status(201).json({
        success: true,
        ...result,
      });
    } catch (err) {
      const status = err.statusCode || 500;
      return sendError(
        res,
        status,
        err.message || "Helpio Pay Terminal Error: Unable to create charge."
      );
    }
  }
);

/* --------------------------------------------------
   CHARGE INVOICE VIA HELPIO PAY TERMINAL
   POST /terminal/charge-invoice
-------------------------------------------------- */
export const chargeInvoiceTerminal = asyncHandler(async (req, res) => {
  const { invoiceId, currency, captureMethod, idempotencyKey } = req.body;

  try {
    const result = await createInvoiceTerminalIntent({
      userId: req.user?._id,
      invoiceId,
      currency,
      captureMethod,
      idempotencyKey,
    });

    // If already paid
    if (result.alreadyPaid) {
      return res.json({
        success: true,
        alreadyPaid: true,
        invoice: result.invoice,
      });
    }

    return res.status(201).json({
      success: true,
      ...result,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    return sendError(
      res,
      status,
      err.message ||
        "Helpio Pay Terminal Error: Unable to start invoice Tap to Pay."
    );
  }
});

/* --------------------------------------------------
   CHARGE SUBSCRIPTION VIA HELPIO PAY TERMINAL
   POST /terminal/charge-subscription
-------------------------------------------------- */
export const chargeSubscriptionTerminal = asyncHandler(
  async (req, res) => {
    const { subscriptionId, captureMethod, idempotencyKey } = req.body;

    try {
      const result = await createSubscriptionTerminalIntent({
        userId: req.user?._id,
        subscriptionId,
        captureMethod,
        idempotencyKey,
      });

      return res.status(201).json({
        success: true,
        ...result,
      });
    } catch (err) {
      const status = err.statusCode || 500;
      return sendError(
        res,
        status,
        err.message ||
          "Helpio Pay Terminal Error: Unable to start subscription Tap to Pay."
      );
    }
  }
);

/* --------------------------------------------------
   PROCESS SIMULATED TAP-TO-PAY
-------------------------------------------------- */
export const processTerminalPayment = asyncHandler(async (req, res) => {
  const { paymentIntentId, readerId } = req.body;

  try {
    const result = await processSimulatedTapToPay({
      paymentIntentId,
      readerId,
    });

    return res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    return sendError(
      res,
      status,
      err.message || "Helpio Pay Terminal Error: Unable to process tap."
    );
  }
});

/* --------------------------------------------------
   CAPTURE TERMINAL PAYMENT (Idempotent & Branded)
-------------------------------------------------- */
export const captureTerminalPayment = asyncHandler(async (req, res) => {
  const { paymentIntentId, idempotencyKey } = req.body;

  try {
    const result = await captureTerminalPaymentService({
      paymentIntentId,
      idempotencyKey,
    });

    return res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    return sendError(
      res,
      status,
      err.message ||
        "Helpio Pay Terminal Error: Unable to capture payment."
    );
  }
});
