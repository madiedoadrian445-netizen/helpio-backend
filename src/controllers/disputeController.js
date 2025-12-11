// src/controllers/disputeController.js
import mongoose from "mongoose";
import Dispute from "../models/Dispute.js";
import Invoice from "../models/Invoice.js";
import SubscriptionCharge from "../models/SubscriptionCharge.js";
import {
  recordDisputeOpenedLedger,
  recordDisputeWonLedger,
  recordDisputeLostLedger,
} from "../utils/ledger.js";
import { logPaymentEvent } from "../utils/logger.js";

/* -------------------------------------------------------
   HELPERS
-------------------------------------------------------- */
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const parsePagination = (req) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(
    Math.max(parseInt(req.query.limit || "25", 10), 1),
    100
  );
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

/* -------------------------------------------------------
   INTERNAL: OPEN DISPUTE (used by webhook + admin manual)
-------------------------------------------------------- */
export const openDispute = async ({
  providerId,
  amountCents,
  currency,
  reason,
  processorDisputeId,
  processorChargeId,
  processorPaymentIntentId,
  invoiceId = null,
  subscriptionChargeId = null,
  terminalPaymentId = null,
  metadata = {},
}) => {
  if (!providerId) return null;

  // Prevent duplicates if webhook fires twice
  let existing = null;
  if (processorDisputeId) {
    existing = await Dispute.findOne({ processorDisputeId }).lean();
  }
  if (existing) return existing;

  const dispute = await Dispute.create({
    provider: providerId,
    amount: amountCents,
    currency: currency || "usd",
    reason: reason || null,
    status: "open",
    invoice: invoiceId || null,
    subscriptionCharge: subscriptionChargeId || null,
    terminalPaymentId: terminalPaymentId || null,
    processorDisputeId,
    processorChargeId,
    processorPaymentIntentId,
    processorType: processorDisputeId ? "stripe" : "simulated",
    metadata,
  });

  // Ledger entry: subtract money from provider pending balance
  let ledgerEntry = null;
  try {
    ledgerEntry = await recordDisputeOpenedLedger({
      providerId,
      amount: amountCents,
      currency,
      disputeId: dispute._id,
      referenceType: invoiceId
        ? "invoice"
        : subscriptionChargeId
        ? "subscription_charge"
        : "terminal",
      referenceId: invoiceId || subscriptionChargeId || terminalPaymentId,
    });

    await Dispute.findByIdAndUpdate(dispute._id, {
      openedLedgerEntry: ledgerEntry?._id || null,
    });
  } catch (err) {
    console.error("⚠️ Ledger dispute-open error:", err.message);
  }

  logPaymentEvent("dispute.opened", {
    disputeId: dispute._id.toString(),
    providerId: providerId.toString(),
    amountCents,
  });

  return dispute;
};

/* -------------------------------------------------------
   PROVIDER: GET MY DISPUTES
-------------------------------------------------------- */
export const getMyDisputes = async (req, res) => {
  try {
    const providerId = req.user?.provider || req.user?._id;
    if (!providerId) return sendError(res, 400, "Provider not found.");

    const { page, limit, skip } = parsePagination(req);
    const query = { provider: providerId };

    if (req.query.status) query.status = req.query.status;

    const [list, total] = await Promise.all([
      Dispute.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Dispute.countDocuments(query),
    ]);

    return res.json({
      success: true,
      data: list,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("getMyDisputes error:", err);
    return sendError(res, 500, "Failed to fetch Helpio Pay disputes.");
  }
};

/* -------------------------------------------------------
   PROVIDER: GET SINGLE DISPUTE
-------------------------------------------------------- */
export const getMyDisputeById = async (req, res) => {
  try {
    const providerId = req.user?.provider || req.user?._id;
    const { disputeId } = req.params;

    if (!isValidId(disputeId)) return sendError(res, 400, "Invalid dispute ID");

    const dispute = await Dispute.findOne({
      _id: disputeId,
      provider: providerId,
    }).lean();

    if (!dispute) return sendError(res, 404, "Dispute not found.");

    return res.json({
      success: true,
      data: dispute,
    });
  } catch (err) {
    console.error("getMyDisputeById error:", err);
    return sendError(res, 500, "Failed to fetch dispute.");
  }
};

/* -------------------------------------------------------
   ADMIN: LIST DISPUTES
-------------------------------------------------------- */
export const getAdminDisputes = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req);
    const query = {};

    if (req.query.providerId) query.provider = req.query.providerId;
    if (req.query.status) query.status = req.query.status;

    if (req.query.fromDate || req.query.toDate) {
      query.createdAt = {};
      if (req.query.fromDate) query.createdAt.$gte = new Date(req.query.fromDate);
      if (req.query.toDate) query.createdAt.$lte = new Date(req.query.toDate);
    }

    const [list, total] = await Promise.all([
      Dispute.find(query)
        .populate("provider", "businessName email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Dispute.countDocuments(query),
    ]);

    return res.json({
      success: true,
      data: list,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("getAdminDisputes error:", err);
    return sendError(res, 500, "Failed to load disputes.");
  }
};

/* -------------------------------------------------------
   ADMIN: GET SINGLE DISPUTE
-------------------------------------------------------- */
export const getAdminDisputeById = async (req, res) => {
  try {
    const { disputeId } = req.params;

    if (!isValidId(disputeId))
      return sendError(res, 400, "Invalid dispute ID.");

    const dispute = await Dispute.findById(disputeId)
      .populate("provider", "businessName email")
      .lean();

    if (!dispute) return sendError(res, 404, "Dispute not found.");

    return res.json({ success: true, data: dispute });
  } catch (err) {
    console.error("getAdminDisputeById error:", err);
    return sendError(res, 500, "Failed to load dispute.");
  }
};

/* -------------------------------------------------------
   ADMIN: MARK DISPUTE WON
-------------------------------------------------------- */
export const markDisputeWon = async (req, res) => {
  try {
    const { disputeId } = req.params;

    const dispute = await Dispute.findById(disputeId);
    if (!dispute) return sendError(res, 404, "Dispute not found.");

    if (dispute.status === "won")
      return sendError(res, 400, "Dispute already marked as won.");

    const ledgerEntry = await recordDisputeWonLedger({
      providerId: dispute.provider,
      amount: dispute.amount,
      currency: dispute.currency,
      disputeId: dispute._id,
      referenceType: dispute.invoice
        ? "invoice"
        : dispute.subscriptionCharge
        ? "subscription_charge"
        : "terminal",
      referenceId:
        dispute.invoice ||
        dispute.subscriptionCharge ||
        dispute.terminalPaymentId,
    });

    dispute.status = "won";
    dispute.closedAt = new Date();
    dispute.resolutionLedgerEntry = ledgerEntry._id;
    await dispute.save();

    logPaymentEvent("dispute.won", {
      disputeId: dispute._id.toString(),
      providerId: dispute.provider.toString(),
      amountCents: dispute.amount,
    });

    return res.json({
      success: true,
      message: "Dispute marked as won.",
    });
  } catch (err) {
    console.error("markDisputeWon error:", err);
    return sendError(res, 500, "Failed to mark dispute as won.");
  }
};

/* -------------------------------------------------------
   ADMIN: MARK DISPUTE LOST
-------------------------------------------------------- */
export const markDisputeLost = async (req, res) => {
  try {
    const { disputeId } = req.params;

    const dispute = await Dispute.findById(disputeId);
    if (!dispute) return sendError(res, 404, "Dispute not found.");

    if (dispute.status === "lost")
      return sendError(res, 400, "Dispute already marked as lost.");

    const ledgerEntry = await recordDisputeLostLedger({
      providerId: dispute.provider,
      amount: dispute.amount,
      currency: dispute.currency,
      disputeId: dispute._id,
      referenceType: dispute.invoice
        ? "invoice"
        : dispute.subscriptionCharge
        ? "subscription_charge"
        : "terminal",
      referenceId:
        dispute.invoice ||
        dispute.subscriptionCharge ||
        dispute.terminalPaymentId,
    });

    dispute.status = "lost";
    dispute.closedAt = new Date();
    dispute.resolutionLedgerEntry = ledgerEntry._id;
    await dispute.save();

    logPaymentEvent("dispute.lost", {
      disputeId: dispute._id.toString(),
      providerId: dispute.provider.toString(),
      amountCents: dispute.amount,
    });

    return res.json({
      success: true,
      message: "Dispute marked as lost.",
    });
  } catch (err) {
    console.error("markDisputeLost error:", err);
    return sendError(res, 500, "Failed to mark dispute as lost.");
  }
};
