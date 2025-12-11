// src/routes/financialStatementRoutes.js
import express from "express";
import { protect } from "../middleware/auth.js";
import {
  generateMyMonthlyStatement,
  listMyStatements,
  getMyStatementById,
  downloadMyStatementCsv,
  adminGenerateMonthlyStatementForProvider,
  adminListStatementsForProvider,
} from "../controllers/financialStatementController.js";

const router = express.Router();

/* -----------------------------
   PROVIDER ROUTES
------------------------------ */

// POST /api/financial-statements/generate/monthly
router.post("/generate/monthly", protect, generateMyMonthlyStatement);

// GET /api/financial-statements/me
router.get("/me", protect, listMyStatements);

// GET /api/financial-statements/me/:statementId
router.get("/me/:statementId", protect, getMyStatementById);

// GET /api/financial-statements/me/:statementId/csv
router.get("/me/:statementId/csv", protect, downloadMyStatementCsv);

/* -----------------------------
   ADMIN ROUTES
   NOTE: Admin guard is inside controller (req.user.isAdmin)
------------------------------ */

// POST /api/financial-statements/admin/generate/monthly
router.post(
  "/admin/generate/monthly",
  protect,
  adminGenerateMonthlyStatementForProvider
);

// GET /api/financial-statements/admin/provider/:providerId
router.get(
  "/admin/provider/:providerId",
  protect,
  adminListStatementsForProvider
);

export default router;
