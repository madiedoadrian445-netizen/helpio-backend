// src/controllers/adminPayoutController.js

import mongoose from "mongoose";
import Payout from "../models/Payout.js";
import Provider from "../models/Provider.js";
import ProviderBalance from "../models/ProviderBalance.js";
import LedgerEntry from "../models/LedgerEntry.js";
import AdminPayoutAction from "../models/AdminPayoutAction.js";

import {
  reserveIdempotencyKey,
  markIdempotencyKeyCompleted,
  markIdempotencyKeyFailed,
} from "../utils/idempotency.js";

/* ===========================================================
   HELPERS
=========================================================== */

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

const normalizeCurrency = (c) =>
  !c || typeof c !== "string" ? "usd" : c.toLowerCase();

/* ===========================================================
   ADMIN: LIST ALL PAYOUTS
=========================================================== */

export const adminListPayouts = async (req, res) => {
  try {
    const { page = 1, limit = 30 } = req.query;
    const skip = (page - 1) * limit;

    const filter = {};

    if (req.query.status) filter.status = req.query.status;
    if (req.query.providerId) filter.provider = req.query.providerId;

    const [payouts, total] = await Promise.all([
      Payout.find(filter)
        .populate("provider", "businessName email")
        .populate("ledgerEntry")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Payout.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      payouts,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
      },
    });
  } catch (err) {
    console.error("adminListPayouts:", err);
    return sendError(res, 500, "Failed to load payouts.");
  }
};

/* ===========================================================
   ADMIN: GET SINGLE PAYOUT
=========================================================== */
export const adminGetPayout = async (req, res) => {
  try {
    const payout = await Payout.findById(req.params.payoutId)
      .populate("provider", "businessName email")
      .populate("ledgerEntry")
      .lean();

    if (!payout) return sendError(res, 404, "Payout not found.");

    return res.json({ success: true, payout });
  } catch (err) {
    console.error("adminGetPayout:", err);
    return sendError(res, 500, "Failed to load payout.");
  }
};

/* ===========================================================
   INTERNAL: Write admin audit log
=========================================================== */

async function logAdminAction({
  adminId,
  payoutId,
  actionType,
  reason,
  changes = {},
  ledgerEntry = null,
  req,
}) {
  try {
    await AdminPayoutAction.create({
      admin: adminId,
      payout: payoutId,
      actionType,
      reason: reason || null,
      changes,
      ledgerEntry,
      ipAddress: req?.ip || null,
      userAgent: req?.headers["user-agent"] || null,
      metadata: {
        route: req?.originalUrl,
      },
    });
  } catch (err) {
    console.error("⚠️ AdminPayoutAction logging failed:", err.message);
  }
}

/* ===========================================================
   ADMIN: MARK PAYOUT PAID
=========================================================== */

export const adminMarkPayoutPaid = async (req, res) => {
  try {
    const adminId = req.user?._id;
    const { payoutId } = req.params;
    const { idempotencyKey, reason } = req.body;

    if (!idempotencyKey) {
      return sendError(res, 400, "idempotencyKey required.");
    }

    const payout = await Payout.findById(payoutId);
    if (!payout) return sendError(res, 404, "Payout not found.");

    if (payout.status === "paid") {
      return sendError(res, 400, "Payout already marked as paid.");
    }

    /* 1️⃣ Reserve idempotency */

    let idem;
    try {
      idem = await reserveIdempotencyKey({
        key: idempotencyKey,
        type: "admin_mark_payout_paid",
        providerId: payout.provider,
        payoutId: payout._id,
        amount: payout.amount,
        currency: payout.currency,
        initiatedBy: "admin",
      });
    } catch (err) {
      return sendError(res, 400, err.message);
    }

    if (idem.status === "existing_completed") {
      return res.json({ success: true, replay: true });
    }
    if (idem.status === "existing_in_progress") {
      return sendError(res, 409, "Action already in progress.");
    }
    if (idem.status === "existing_failed") {
      return sendError(res, 409, "Previous attempt failed.");
    }

    const idemId = idem.record._id;

    /* 2️⃣ Transaction */

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const before = {
        status: payout.status,
      };

      payout.status = "paid";
      payout.arrivalDate = new Date();
      payout.approvedBy = adminId;
      payout.lockedAt = null;

      await payout.save({ session });

      /* Ledger (for admin-reconciled payouts) */
      const [ledger] = await LedgerEntry.create(
        [
          {
            provider: payout.provider,
            type: "payout",
            direction: "debit",
            amount: payout.amount,
            currency: payout.currency,
            sourceType: "payout_admin",
            payout: payout._id,
            effectiveAt: new Date(),
            availableAt: new Date(),
            createdBy: "admin",
            metadata: {
              adminMarkedPaid: true,
              reason,
            },
          },
        ],
        { session }
      );

      payout.ledgerEntry = ledger._id;
      await payout.save({ session });

      await session.commitTransaction();
      session.endSession();

      /* 3️⃣ Admin audit logging */
      await logAdminAction({
        adminId,
        payoutId: payout._id,
        actionType: "mark_paid",
        reason,
        ledgerEntry: ledger._id,
        changes: {
          oldStatus: before.status,
          newStatus: "paid",
        },
        req,
      });

      await markIdempotencyKeyCompleted(idemId, {
        payoutId: payout._id,
        ledgerEntryId: ledger._id,
      });

      return res.json({
        success: true,
        message: "Payout marked as paid.",
        payout,
        ledgerEntry: ledger,
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();

      await markIdempotencyKeyFailed(idemId, { error: err.message });

      console.error("adminMarkPayoutPaid error:", err);
      return sendError(res, 500, "Server error marking payout paid.");
    }
  } catch (err) {
    console.error("adminMarkPayoutPaid fatal:", err);
    return sendError(res, 500, "Server error.");
  }
};

/* ===========================================================
   ADMIN: CANCEL PAYOUT
=========================================================== */

export const adminCancelPayout = async (req, res) => {
  try {
    const adminId = req.user?._id;
    const { payoutId } = req.params;
    const { reason, idempotencyKey } = req.body;

    if (!idempotencyKey) {
      return sendError(res, 400, "idempotencyKey required.");
    }

    const payout = await Payout.findById(payoutId);
    if (!payout) return sendError(res, 404, "Payout not found.");

    if (payout.status === "canceled") {
      return sendError(res, 400, "Payout already canceled.");
    }
    if (payout.status === "paid") {
      return sendError(res, 400, "Cannot cancel a paid payout.");
    }

    /* 1️⃣ Reserve idempotency */

    let idem;
    try {
      idem = await reserveIdempotencyKey({
        key: idempotencyKey,
        type: "admin_cancel_payout",
        providerId: payout.provider,
        payoutId: payout._id,
        initiatedBy: "admin",
      });
    } catch (err) {
      return sendError(res, 400, err.message);
    }

    if (idem.status === "existing_completed") {
      return res.json({ success: true, replay: true });
    }
    if (idem.status === "existing_in_progress") {
      return sendError(res, 409, "Action already in progress.");
    }

    const idemId = idem.record._id;

    /* 2️⃣ Transaction */

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const before = { status: payout.status };

      payout.status = "canceled";
      payout.rejectedBy = adminId;
      payout.canceledAt = new Date();

      await payout.save({ session });

      /* Admin audit log */
      await logAdminAction({
        adminId,
        payoutId: payout._id,
        actionType: "cancel",
        reason,
        changes: {
          oldStatus: before.status,
          newStatus: "canceled",
        },
        req,
      });

      await session.commitTransaction();
      session.endSession();

      await markIdempotencyKeyCompleted(idemId, {
        payoutId: payout._id,
      });

      return res.json({
        success: true,
        message: "Payout canceled.",
        payout,
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      await markIdempotencyKeyFailed(idemId, { error: err.message });

      console.error("adminCancelPayout error:", err);
      return sendError(res, 500, "Server error canceling payout.");
    }
  } catch (err) {
    console.error("adminCancelPayout fatal:", err);
    return sendError(res, 500, "Server error.");
  }
};
