// src/controllers/ledgerController.js
import mongoose from "mongoose";
import LedgerEntry from "../models/LedgerEntry.js";
import ProviderBalance from "../models/ProviderBalance.js";
import Payout from "../models/Payout.js";

const { Types } = mongoose;

/* -------------------------------------------------------
   HELPERS
-------------------------------------------------------- */

const parsePagination = (req) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "25", 10), 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const buildLedgerFilter = (req, { providerId }) => {
  const filter = {};
  if (providerId) filter.provider = new Types.ObjectId(providerId);

  const { type, direction, referenceType, fromDate, toDate } = req.query;

  if (type) filter.type = type;
  if (direction) filter.direction = direction;
  if (referenceType) filter.referenceType = referenceType;

  if (fromDate || toDate) {
    filter.effectiveAt = {};
    if (fromDate) filter.effectiveAt.$gte = new Date(fromDate);
    if (toDate) filter.effectiveAt.$lte = new Date(toDate);
  }

  return filter;
};

const resolveProviderId = (req) => {
  if (req.query.providerId) return req.query.providerId;
  if (req.user?.provider) return req.user.provider;
  if (req.user?._id) return req.user._id.toString();
  return null;
};

/* -------------------------------------------------------
   PROVIDER: GET MY BALANCE SUMMARY
   GET /api/ledger/me/balance
-------------------------------------------------------- */
export const getMyBalanceSummary = async (req, res) => {
  try {
    const providerId = resolveProviderId(req);

    if (!providerId)
      return res.status(400).json({
        success: false,
        message: "Unable to resolve provider account.",
      });

    const balance = await ProviderBalance.findOne({ provider: providerId }).lean();

    if (!balance) {
      return res.status(200).json({
        success: true,
        data: {
          available: 0,
          pending: 0,
          reserved: 0,
          currency: "usd",
          hasBalanceRecord: false,
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        available: balance.available || 0,
        pending: balance.pending || 0,
        reserved: balance.reserved || 0,
        currency: balance.currency || "usd",
        updatedAt: balance.updatedAt,
        hasBalanceRecord: true,
      },
    });
  } catch (err) {
    console.error("getMyBalanceSummary error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to load Helpio Pay balance.",
    });
  }
};

/* -------------------------------------------------------
   PROVIDER: GET MY LEDGER ENTRIES
   GET /api/ledger/me/entries
-------------------------------------------------------- */
export const getMyLedgerEntries = async (req, res) => {
  try {
    const providerId = resolveProviderId(req);

    if (!providerId)
      return res.status(400).json({
        success: false,
        message: "Unable to resolve provider account.",
      });

    const { page, limit, skip } = parsePagination(req);
    const filter = buildLedgerFilter(req, { providerId });

    const [entries, total] = await Promise.all([
      LedgerEntry.find(filter)
        .sort({ effectiveAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      LedgerEntry.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        entries,
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    console.error("getMyLedgerEntries error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to load Helpio Pay ledger entries.",
    });
  }
};

/* -------------------------------------------------------
   ADMIN: GET SPECIFIC PROVIDER LEDGER
   GET /api/ledger/admin/provider/:providerId
-------------------------------------------------------- */
export const getProviderLedgerAdmin = async (req, res) => {
  try {
    const { providerId } = req.params;

    if (!providerId || !Types.ObjectId.isValid(providerId))
      return res.status(400).json({
        success: false,
        message: "Invalid providerId.",
      });

    const { page, limit, skip } = parsePagination(req);
    const filter = buildLedgerFilter(req, { providerId });

    const [entries, total, balance, payouts] = await Promise.all([
      LedgerEntry.find(filter)
        .sort({ effectiveAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      LedgerEntry.countDocuments(filter),
      ProviderBalance.findOne({ provider: providerId }).lean(),
      Payout.find({ provider: providerId })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        providerId,
        ledger: {
          entries,
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
        balance: balance || null,
        recentPayouts: payouts,
      },
    });
  } catch (err) {
    console.error("getProviderLedgerAdmin error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to load provider ledger.",
    });
  }
};

/* -------------------------------------------------------
   ADMIN: SYSTEM SUMMARY
   GET /api/ledger/admin/summary
-------------------------------------------------------- */
export const getSystemLedgerSummary = async (req, res) => {
  try {
    const balanceAgg = await ProviderBalance.aggregate([
      {
        $group: {
          _id: null,
          totalAvailable: { $sum: "$available" },
          totalPending: { $sum: "$pending" },
          totalReserved: { $sum: "$reserved" },
          countProviders: { $sum: 1 },
        },
      },
    ]);

    const balanceSummary = balanceAgg[0] || {
      totalAvailable: 0,
      totalPending: 0,
      totalReserved: 0,
      countProviders: 0,
    };

    const ledgerAgg = await LedgerEntry.aggregate([
      {
        $group: {
          _id: "$direction",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    const payoutAgg = await Payout.aggregate([
      {
        $group: {
          _id: "$status",
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      data: {
        balances: balanceSummary,
        ledger: ledgerAgg,
        payouts: payoutAgg,
      },
    });
  } catch (err) {
    console.error("getSystemLedgerSummary error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to load system-wide ledger summary.",
    });
  }
};
