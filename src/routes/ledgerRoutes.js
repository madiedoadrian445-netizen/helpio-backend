// src/routes/ledgerRoutes.js
import express from "express";
import { protect, admin } from "../middleware/auth.js";

import {
  getMyBalanceSummary,
  getMyLedgerEntries,
  getProviderLedgerAdmin,
  getSystemLedgerSummary,
} from "../controllers/ledgerController.js";

const router = express.Router();

/* -------------------------------------------------------
   PROVIDER ROUTES
   /api/ledger/me/...
-------------------------------------------------------- */

router.get("/me/balance", protect, getMyBalanceSummary);
router.get("/me/entries", protect, getMyLedgerEntries);

/* -------------------------------------------------------
   ADMIN ROUTES
   /api/ledger/admin/...
-------------------------------------------------------- */

router.get("/admin/summary", protect, admin, getSystemLedgerSummary);
router.get("/admin/provider/:providerId", protect, admin, getProviderLedgerAdmin);

export default router;
