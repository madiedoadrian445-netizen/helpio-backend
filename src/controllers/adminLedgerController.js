// src/controllers/adminLedgerController.js
import mongoose from "mongoose";
import {
  auditAllProvidersLedger,
  auditProviderLedger,
  recomputeProviderBalanceFromLedger,
} from "../utils/ledgerAudit.js";

const { Types } = mongoose;

const isValidId = (id) => Types.ObjectId.isValid(id);

/* -------------------------------------------------------
   GET /api/admin/ledger/summary
   - High-level view across providers
-------------------------------------------------------- */
export const getLedgerAuditSummary = async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const data = await auditAllProvidersLedger({
      limit: Number.isFinite(limit) && limit > 0 ? limit : 100,
      dryRun: true,
    });

    return res.json({
      success: true,
      mode: "dry_run",
      ...data,
    });
  } catch (err) {
    console.error("❌ getLedgerAuditSummary error:", err);
    next(err);
  }
};

/* -------------------------------------------------------
   GET /api/admin/ledger/provider/:providerId
   - Detailed view of one provider
-------------------------------------------------------- */
export const getProviderLedgerAudit = async (req, res, next) => {
  try {
    const { providerId } = req.params;

    if (!isValidId(providerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid providerId.",
      });
    }

    const data = await auditProviderLedger(providerId, { dryRun: true });

    return res.json({
      success: true,
      mode: "dry_run",
      ...data,
    });
  } catch (err) {
    console.error("❌ getProviderLedgerAudit error:", err);
    next(err);
  }
};

/* -------------------------------------------------------
   POST /api/admin/ledger/provider/:providerId/recompute
   - Actually fix the ProviderBalance from ledger
   - Optional ?currency=usd
-------------------------------------------------------- */
export const recomputeProviderBalanceForProvider = async (
  req,
  res,
  next
) => {
  try {
    const { providerId } = req.params;
    const { currency } = req.query;

    if (!isValidId(providerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid providerId.",
      });
    }

    const targetCurrency = currency || "usd";

    const result = await recomputeProviderBalanceFromLedger(
      providerId,
      targetCurrency,
      { dryRun: false }
    );

    return res.json({
      success: true,
      message: "Provider balance recomputed from ledger.",
      result,
    });
  } catch (err) {
    console.error(
      "❌ recomputeProviderBalanceForProvider error:",
      err
    );
    next(err);
  }
};
