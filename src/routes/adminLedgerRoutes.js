// src/routes/adminLedgerRoutes.js
import express from "express";
import { protect, requireRole } from "../middleware/auth.js";
import {
  getLedgerAuditSummary,
  getProviderLedgerAudit,
  recomputeProviderBalanceForProvider,
} from "../controllers/adminLedgerController.js";

const router = express.Router();

/* -------------------------------------------------------
   ALL routes here are ADMIN-ONLY
-------------------------------------------------------- */
router.use(protect, requireRole("admin"));

/**
 * GET /api/admin/ledger/summary
 * - High-level audit across providers
 */
router.get("/summary", getLedgerAuditSummary);

/**
 * GET /api/admin/ledger/provider/:providerId
 * - Detailed audit for a single provider
 */
router.get("/provider/:providerId", getProviderLedgerAudit);

/**
 * POST /api/admin/ledger/provider/:providerId/recompute
 * - Recalculate ProviderBalance from LedgerEntries (persist)
 * - Optional ?currency=usd
 */
router.post(
  "/provider/:providerId/recompute",
  recomputeProviderBalanceForProvider
);

export default router;
