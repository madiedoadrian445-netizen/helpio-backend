// src/controllers/terminalPaymentController.js
import mongoose from "mongoose";
import TerminalPayment from "../models/TerminalPayment.js";
import Provider from "../models/Provider.js";
import { logCustomerTimelineEvent } from "../utils/timelineLogger.js";

import {
  stripeClient,
  isLiveStripe,
  isSimulatedStripe,
} from "../config/stripe.js";

import { recordTerminalChargeLedger } from "../utils/ledger.js";

import {
  reserveIdempotencyKey,
  markIdempotencyKeyCompleted,
  markIdempotencyKeyFailed,
} from "../utils/idempotency.js";

import auditLog from "../utils/auditLogger.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

/* -------------------------------------------------------
   HELPER – provider from logged-in user
-------------------------------------------------------- */
const getProviderForUser = async (userId) => {
  if (!userId) return null;
  return Provider.findOne({ user: userId });
};

/* -------------------------------------------------------
   HELPER – parse pagination
-------------------------------------------------------- */
const parsePagination = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.max(Math.min(parseInt(query.limit, 10) || 20, 100), 1);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

/* -------------------------------------------------------
   HELPER – parse amount filters
   Supports:
   - amountMinCents / amountMaxCents (raw cents)
   - amountMin / amountMax (DOLLARS -> converted to cents)
-------------------------------------------------------- */
const buildAmountFilter = (query) => {
  let minCents = null;
  let maxCents = null;

  if (query.amountMinCents !== undefined) {
    const v = Number(query.amountMinCents);
    if (!Number.isNaN(v)) minCents = v;
  } else if (query.amountMin !== undefined) {
    const v = Number(query.amountMin);
    if (!Number.isNaN(v)) minCents = Math.round(v * 100);
  }

  if (query.amountMaxCents !== undefined) {
    const v = Number(query.amountMaxCents);
    if (!Number.isNaN(v)) maxCents = v;
  } else if (query.amountMax !== undefined) {
    const v = Number(query.amountMax);
    if (!Number.isNaN(v)) maxCents = Math.round(v * 100);
  }

  const amountFilter = {};
  if (minCents !== null) amountFilter.$gte = minCents;
  if (maxCents !== null) amountFilter.$lte = maxCents;

  return Object.keys(amountFilter).length ? amountFilter : null;
};

/* -------------------------------------------------------
   HELPER – date range filter
   Expects ISO strings or yyyy-mm-dd
-------------------------------------------------------- */
const buildDateFilter = (query) => {
  const { dateFrom, dateTo } = query;
  const createdAt = {};

  if (dateFrom) {
    const from = new Date(dateFrom);
    if (!Number.isNaN(from.getTime())) {
      createdAt.$gte = from;
    }
  }

  if (dateTo) {
    const to = new Date(dateTo);
    if (!Number.isNaN(to.getTime())) {
      // inclusive end-of-day
      to.setHours(23, 59, 59, 999);
      createdAt.$lte = to;
    }
  }

  return Object.keys(createdAt).length ? createdAt : null;
};

/* -------------------------------------------------------
   HELPER – sanitize metadata for PROVIDER
   - keep fraud data
   - strip idempotency / internal fields
-------------------------------------------------------- */
const sanitizeMetadataForProvider = (metadata) => {
  if (!metadata || typeof metadata !== "object") return metadata;

  const cloned = { ...metadata };

  // strip sensitive / internal things (defensive list)
  delete cloned.idempotency;
  delete cloned.idempotencyKey;
  delete cloned.idempotencyKeys;
  delete cloned.internal;
  delete cloned.rawStripeEvent;
  delete cloned.rawStripeResponse;

  return cloned;
};

const sanitizePaymentForProvider = (doc) => {
  const payment = doc.toObject ? doc.toObject({ virtuals: true }) : { ...doc };
  if (payment.metadata) {
    payment.metadata = sanitizeMetadataForProvider(payment.metadata);
  }
  return payment;
};

/* ======================================================
   TERMINAL SESSION LIFECYCLE
   We store sessionId inside metadata.sessionId on TerminalPayment
====================================================== */

/* -------------------------------------------------------
   CREATE TERMINAL SESSION
   POST /api/terminal/create-session
-------------------------------------------------------- */
export const createTerminalSession = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    if (!provider) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized" });
    }

    const { amount, currency = "usd", customerId, description = "" } = req.body;

    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Amount must be > 0" });
    }

    const amountGrossCents = Math.round(parsedAmount * 100);

    const sessionId = `term_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;

    const mode =
      isLiveStripe && stripeClient && !isSimulatedStripe
        ? "live"
        : "simulated";

    const terminalPayment = await TerminalPayment.create({
      provider: provider._id,
      customer: customerId && isValidId(customerId) ? customerId : null,
      invoice: null,
      subscription: null,
      subscriptionCharge: null,
      ledgerEntry: null,

      mode,
      terminalType: "generic",
      paymentIntentId: null,
      chargeId: null,
      currency: currency.toLowerCase(),

      amountGross: amountGrossCents,
      amountNet: 0,
      amountFees: 0,
      stripeFeeCents: 0,
      helpioFeeCents: 0,

      amountAuthorizedCents: 0,
      amountCapturedCents: 0,
      amountRefundedCents: 0,

      status: "initiated",
      captureMethod: "manual",

      settlementDate: null,
      authorizedAt: null,
      capturedAt: null,
      canceledAt: null,
      failedAt: null,

      description,
      readerId: null,
      readerLabel: null,

      metadata: {
        sessionId,
        createdBy: req.user?._id?.toString(),
      },
    });

    return res.status(201).json({
      success: true,
      session: {
        id: sessionId,
        paymentId: terminalPayment._id,
        amount: parsedAmount, // dollars for frontend
      },
    });
  } catch (err) {
    console.error("❌ createTerminalSession error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create terminal session.",
    });
  }
};

/* -------------------------------------------------------
   AUTHORIZE CARD
   POST /api/terminal/authorize
-------------------------------------------------------- */
export const authorizeTerminalPayment = async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res
        .status(400)
        .json({ success: false, message: "sessionId is required" });
    }

    const payment = await TerminalPayment.findOne({
      "metadata.sessionId": sessionId,
    });

    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });
    }

    if (payment.status !== "initiated") {
      return res.status(400).json({
        success: false,
        message: "This session cannot be authorized (wrong state).",
      });
    }

    // SIMULATED AUTHORIZATION
    if (isSimulatedStripe || !stripeClient || !isLiveStripe) {
      payment.amountAuthorizedCents = payment.amountGross;
      payment.status = "authorized";
      payment.authorizedAt = new Date();
      await payment.save();

      return res.json({
        success: true,
        mode: "simulated",
        authorized: true,
        amount: payment.amountGross / 100, // dollars
      });
    }

    // LIVE STRIPE TERMINAL — create PI
    const pi = await stripeClient.paymentIntents.create({
      amount: payment.amountGross,
      currency: payment.currency,
      payment_method_types: ["card_present"],
      metadata: {
        brand: "Helpio Pay",
        type: "helpio_terminal",
        sessionId,
        providerId: payment.provider.toString(),
        terminalPaymentId: payment._id.toString(),
      },
      capture_method: "manual",
    });

    payment.paymentIntentId = pi.id;
    payment.amountAuthorizedCents = payment.amountGross;
    payment.status = "authorized";
    payment.authorizedAt = new Date();
    payment.mode = "live";
    await payment.save();

    return res.json({
      success: true,
      mode: "live",
      authorized: true,
      paymentIntent: pi.id,
    });
  } catch (err) {
    console.error("❌ authorizeTerminalPayment error:", err);
    return res.status(500).json({
      success: false,
      message: "Terminal authorization failed.",
    });
  }
};

/* -------------------------------------------------------
   CAPTURE PAYMENT (CHARGE)
   POST /api/terminal/capture
-------------------------------------------------------- */
export const captureTerminalPayment = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    if (!provider) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized" });
    }

    const { sessionId, idempotencyKey } = req.body;
    if (!idempotencyKey) {
      return res
        .status(400)
        .json({ success: false, message: "idempotencyKey is required" });
    }

    if (!sessionId) {
      return res
        .status(400)
        .json({ success: false, message: "sessionId is required" });
    }

    const payment = await TerminalPayment.findOne({
      "metadata.sessionId": sessionId,
    }).populate("customer");

    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });
    }

    if (payment.status !== "authorized") {
      return res.status(400).json({
        success: false,
        message: "Payment is not in an authorized state.",
      });
    }

    /* ---------------------------------------------------
       IDEMPOTENCY RESERVE
    ---------------------------------------------------- */
    let idem;
    try {
      idem = await reserveIdempotencyKey({
        key: idempotencyKey,
        type: "terminal_capture",
        amount: payment.amountGross, // already in cents
        currency: payment.currency,
        providerId: provider._id,
        terminalPaymentId: payment._id,
        payloadForHash: {
          sessionId,
          amountGrossCents: payment.amountGross,
        },
      });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    if (idem.status === "existing_completed") {
      return res.json({
        success: true,
        replay: true,
        message: "Payment already captured",
      });
    }
    if (idem.status === "existing_failed") {
      return res
        .status(409)
        .json({ success: false, message: "Previous attempt failed" });
    }

    const idemId = idem.record._id;

    /* ---------------------------------------------------
       SIMULATED CAPTURE
    ---------------------------------------------------- */
    if (isSimulatedStripe || !stripeClient || !isLiveStripe) {
      payment.amountCapturedCents = payment.amountAuthorizedCents || payment.amountGross;
      payment.status = "captured";
      payment.capturedAt = new Date();

      // Settlement (T+7)
      const settle = new Date();
      settle.setDate(settle.getDate() + 7);
      payment.settlementDate = settle;

      await payment.save();

      // LEDGER ENTRY
      const ledgerResult = await recordTerminalChargeLedger({
        providerId: provider._id,
        customerId: payment.customer?._id || null,
        terminalPaymentId: payment._id,
        grossAmountCents: payment.amountCapturedCents,
        trigger: "terminal_payment_simulated",
      });

      payment.ledgerEntry = ledgerResult.entry?._id || null;
      await payment.save();

      const amountDollars = payment.amountCapturedCents / 100;

     await logCustomerTimelineEvent({
  providerId: provider._id,
  customerId: payment.customer?._id,
  type: "payment",
  title: "Terminal Payment Captured",
  description: `Charged $${amountDollars.toFixed(
    2
  )} (simulated) via Helpio Pay Terminal`,
  amount: amountDollars,
});


      await markIdempotencyKeyCompleted(idemId, {
        ledgerEntryId: ledgerResult.entry?._id || null,
        extraContext: {
          mode: "simulated",
          terminalPaymentId: payment._id.toString(),
        },
      });

      return res.json({
        success: true,
        mode: "simulated",
        captured: true,
        payment,
        ledgerEntry: ledgerResult.entry || null,
      });
    }

    /* ---------------------------------------------------
       LIVE STRIPE CAPTURE
    ---------------------------------------------------- */
    let capturedPI;
    try {
      capturedPI = await stripeClient.paymentIntents.capture(
        payment.paymentIntentId,
        {},
        { idempotencyKey }
      );
    } catch (err) {
      await markIdempotencyKeyFailed(idemId, {
        extraContext: { error: err.message },
      });
      return res.status(500).json({
        success: false,
        message: "Capture failed at processor.",
      });
    }

    payment.amountCapturedCents = capturedPI.amount_received;
    payment.status = "captured";
    payment.capturedAt = new Date();

    const settle = new Date();
    settle.setDate(settle.getDate() + 7);
    payment.settlementDate = settle;

    payment.chargeId = capturedPI.latest_charge || payment.chargeId;

    await payment.save();

    const ledgerResult = await recordTerminalChargeLedger({
      providerId: provider._id,
      customerId: payment.customer?._id || null,
      terminalPaymentId: payment._id,
      stripePaymentIntentId: capturedPI.id,
      stripeChargeId: capturedPI.latest_charge,
      grossAmountCents: capturedPI.amount_received,
      trigger: "terminal_payment_live",
    });

    payment.ledgerEntry = ledgerResult.entry?._id || null;
    await payment.save();

    const capturedDollars = capturedPI.amount_received / 100;

   await logCustomerTimelineEvent({
  providerId: provider._id,
  customerId: payment.customer?._id,
  type: "payment",
  title: "Terminal Payment Captured",
  description: `Charged $${capturedDollars.toFixed(
    2
  )} via Helpio Pay Terminal`,
  amount: capturedDollars,
});


    await markIdempotencyKeyCompleted(idemId, {
      stripePaymentIntentId: capturedPI.id,
      stripeChargeId: capturedPI.latest_charge,
      ledgerEntryId: ledgerResult.entry?._id || null,
      extraContext: {
        mode: "live",
        terminalPaymentId: payment._id.toString(),
      },
    });

    return res.json({
      success: true,
      mode: "live",
      captured: true,
      payment,
      ledgerEntry: ledgerResult.entry || null,
    });
  } catch (err) {
    console.error("❌ captureTerminalPayment error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to capture payment.",
    });
  }
};

/* -------------------------------------------------------
   CANCEL TERMINAL SESSION
   POST /api/terminal/cancel
-------------------------------------------------------- */
export const cancelTerminalSession = async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res
        .status(400)
        .json({ success: false, message: "sessionId is required" });
    }

    const payment = await TerminalPayment.findOne({
      "metadata.sessionId": sessionId,
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    if (payment.status !== "initiated") {
      return res.status(400).json({
        success: false,
        message: "Only initiated sessions can be canceled",
      });
    }

    payment.status = "canceled";
    payment.canceledAt = new Date();
    await payment.save();

    return res.json({
      success: true,
      message: "Terminal session canceled.",
    });
  } catch (err) {
    console.error("❌ cancelTerminalSession error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to cancel session.",
    });
  }
};

/* =======================================================
   B22 – PROVIDER ENDPOINTS (TerminalPayment)
======================================================= */

/* -------------------------------------------------------
   GET MY TERMINAL PAYMENTS
   GET /api/terminal-payments/me (route currently "/")
-------------------------------------------------------- */
export const getMyTerminalPayments = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    if (!provider) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized" });
    }

    const { page, limit, skip } = parsePagination(req.query);

    const filter = { provider: provider._id };

    // basic filters
    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (req.query.mode) {
      filter.mode = req.query.mode;
    }

    if (req.query.terminalType) {
      filter.terminalType = req.query.terminalType;
    }

    // date range
    const createdAt = buildDateFilter(req.query);
    if (createdAt) filter.createdAt = createdAt;

    // amount range
    const amountFilter = buildAmountFilter(req.query);
    if (amountFilter) filter.amountGross = amountFilter;

    const total = await TerminalPayment.countDocuments(filter);

    const rawPayments = await TerminalPayment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("provider", "businessName _id")
      .populate("customer", "name phone email")
      .populate("invoice", "invoiceNumber total")
      .populate("ledgerEntry");

    // sanitize metadata (providers should not see idempotency / internals)
    const payments = rawPayments.map(sanitizePaymentForProvider);

    return res.json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      payments,
    });
  } catch (err) {
    console.error("❌ getMyTerminalPayments error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch terminal payments.",
    });
  }
};

/* -------------------------------------------------------
   GET SINGLE TERMINAL PAYMENT (PROVIDER)
   GET /api/terminal-payments/:id
-------------------------------------------------------- */
export const getTerminalPaymentById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid payment id" });
    }

    const provider = await getProviderForUser(req.user?._id);
    if (!provider) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized" });
    }

    const rawPayment = await TerminalPayment.findById(id)
      .populate("provider", "businessName _id")
      .populate("customer", "name phone email")
      .populate("invoice", "invoiceNumber total")
      .populate("ledgerEntry");

    if (
      !rawPayment ||
      rawPayment.provider.toString() !== provider._id.toString()
    ) {
      // hide existence if not owned
      return res
        .status(404)
        .json({ success: false, message: "Payment not found" });
    }

    // provider-safe view (fraud info OK, idempotency stripped)
    const payment = sanitizePaymentForProvider(rawPayment);

    return res.json({
      success: true,
      payment,
    });
  } catch (err) {
    console.error("❌ getTerminalPaymentById error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch terminal payment.",
    });
  }
};

/* =======================================================
   B22 – ADMIN ENDPOINTS (TerminalPayment)
======================================================= */

/* -------------------------------------------------------
   ADMIN: LIST TERMINAL PAYMENTS
   GET /api/admin/terminal-payments
-------------------------------------------------------- */
export const adminListTerminalPayments = async (req, res) => {
  try {
    if (!req.user || !req.user.isAdmin) {
      return res
        .status(403)
        .json({ success: false, message: "Admin only" });
    }

    const { page, limit, skip } = parsePagination(req.query);

    const filter = {};

    // provider filter
    if (req.query.providerId && isValidId(req.query.providerId)) {
      filter.provider = req.query.providerId;
    }

    // status / mode / type
    if (req.query.status) filter.status = req.query.status;
    if (req.query.mode) filter.mode = req.query.mode;
    if (req.query.terminalType) filter.terminalType = req.query.terminalType;

    // method -> captureMethod
    if (req.query.method) {
      filter.captureMethod = req.query.method;
    }

    // date range
    const createdAt = buildDateFilter(req.query);
    if (createdAt) filter.createdAt = createdAt;

    // amount range
    const amountFilter = buildAmountFilter(req.query);
    if (amountFilter) filter.amountGross = amountFilter;

    // optional free-text search on description
    if (req.query.q) {
      filter.description = { $regex: req.query.q, $options: "i" };
    }

    const total = await TerminalPayment.countDocuments(filter);

    // sort: default by newest, or fraudScore if requested
    let sort = { createdAt: -1 };
    if (req.query.sortBy === "fraud") {
      sort = { "metadata.fraud.fraudScore": -1, createdAt: -1 };
    }

    const payments = await TerminalPayment.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate("provider", "businessName _id")
      .populate("customer", "name phone email")
      .populate("invoice", "invoiceNumber total")
      .populate("ledgerEntry");

    // AUDIT LOG
    try {
      await auditLog({
        actor: req.user._id?.toString(),
        action: "admin.read_terminal_payments",
        entityType: "TerminalPayment",
        entityId: null,
        ip: req.ip,
        userAgent: req.headers["user-agent"] || "",
        details: {
          filter,
          page,
          limit,
          sort,
        },
      });
    } catch (auditErr) {
      console.warn(
        "⚠️ audit log failed (adminListTerminalPayments):",
        auditErr.message
      );
    }

    return res.json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      payments,
    });
  } catch (err) {
    console.error("❌ adminListTerminalPayments error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch terminal payments (admin).",
    });
  }
};

/* -------------------------------------------------------
   ADMIN: GET SINGLE TERMINAL PAYMENT
   GET /api/admin/terminal-payments/:id
-------------------------------------------------------- */
export const adminGetTerminalPayment = async (req, res) => {
  try {
    if (!req.user || !req.user.isAdmin) {
      return res
        .status(403)
        .json({ success: false, message: "Admin only" });
    }

    const { id } = req.params;

    if (!isValidId(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid payment id" });
    }

    const payment = await TerminalPayment.findById(id)
      .populate("provider", "businessName _id")
      .populate("customer", "name phone email")
      .populate("invoice", "invoiceNumber total")
      .populate("ledgerEntry");

    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "Payment not found" });
    }

    // AUDIT LOG
    try {
      await auditLog({
        actor: req.user._id?.toString(),
        action: "admin.read_terminal_payment_detail",
        entityType: "TerminalPayment",
        entityId: payment._id,
        ip: req.ip,
        userAgent: req.headers["user-agent"] || "",
        details: {
          paymentId: id,
          providerId: payment.provider?._id || null,
          status: payment.status,
        },
      });
    } catch (auditErr) {
      console.warn(
        "⚠️ audit log failed (adminGetTerminalPayment):",
        auditErr.message
      );
    }

    return res.json({
      success: true,
      payment,
    });
  } catch (err) {
    console.error("❌ adminGetTerminalPayment error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch terminal payment (admin).",
    });
  }
};
