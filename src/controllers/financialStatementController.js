// src/controllers/financialStatementController.js
import mongoose from "mongoose";
import { FinancialStatement } from "../models/FinancialStatement.js";
import {
  computeAndPersistMonthlyStatement,
  financialStatementToCsv,
  buildMonthlyPeriod,
} from "../utils/financialStatements.js";

const { Types } = mongoose;

const isValidId = (id) => Types.ObjectId.isValid(id);

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

/**
 * Infer provider id from req.user
 * Adjust this to match your auth/user → provider relationship.
 */
const getProviderIdFromUser = (user) => {
  if (!user) return null;
  // If you store provider id directly:
  if (user.provider) return user.provider;
  // Or if user._id IS the provider:
  return user._id;
};

/**
 * Provider: Generate monthly statement for themselves.
 * POST /api/financial-statements/generate/monthly
 * Body: { year?, month?, currency? }
 * - If year/month omitted -> defaults to LAST month.
 */
export const generateMyMonthlyStatement = async (req, res) => {
  try {
    const providerId = getProviderIdFromUser(req.user);
    if (!isValidId(providerId)) {
      return sendError(res, 400, "Provider profile not found for this user");
    }

    const now = new Date();
    const defaultYear = now.getUTCFullYear();
    const defaultMonth = now.getUTCMonth(); // 0-based
    const lastMonthDate = new Date(Date.UTC(defaultYear, defaultMonth - 1, 1));

    const year = req.body.year || lastMonthDate.getUTCFullYear();
    const month = req.body.month || lastMonthDate.getUTCMonth() + 1; // back to 1–12
    const currency = req.body.currency || "usd";

    const statement = await computeAndPersistMonthlyStatement({
      providerId,
      year,
      month,
      currency,
      metadata: { generatedBy: "manual", source: "api:provider" },
    });

    return res.json({ success: true, statement });
  } catch (err) {
    console.error("generateMyMonthlyStatement error:", err);
    return sendError(res, 500, "Failed to generate financial statement");
  }
};

/**
 * Provider: List all their statements (optionally filtered by year).
 * GET /api/financial-statements/me?year=2025
 */
export const listMyStatements = async (req, res) => {
  try {
    const providerId = getProviderIdFromUser(req.user);
    if (!isValidId(providerId)) {
      return sendError(res, 400, "Provider profile not found for this user");
    }

    const { year } = req.query;
    const filter = { provider: providerId };

    if (year) {
      filter.year = Number(year);
    }

    const statements = await FinancialStatement.find(filter)
      .sort({ year: -1, month: -1 })
      .lean();

    return res.json({ success: true, statements });
  } catch (err) {
    console.error("listMyStatements error:", err);
    return sendError(res, 500, "Failed to fetch financial statements");
  }
};

/**
 * Provider: Get a specific statement they own.
 * GET /api/financial-statements/me/:statementId
 */
export const getMyStatementById = async (req, res) => {
  try {
    const providerId = getProviderIdFromUser(req.user);
    if (!isValidId(providerId)) {
      return sendError(res, 400, "Provider profile not found for this user");
    }

    const { statementId } = req.params;
    if (!isValidId(statementId)) {
      return sendError(res, 400, "Invalid statement id");
    }

    const statement = await FinancialStatement.findOne({
      _id: statementId,
      provider: providerId,
    }).lean();

    if (!statement) {
      return sendError(res, 404, "Statement not found");
    }

    return res.json({ success: true, statement });
  } catch (err) {
    console.error("getMyStatementById error:", err);
    return sendError(res, 500, "Failed to fetch financial statement");
  }
};

/**
 * Provider: Download CSV for a specific statement they own.
 * GET /api/financial-statements/me/:statementId/csv
 */
export const downloadMyStatementCsv = async (req, res) => {
  try {
    const providerId = getProviderIdFromUser(req.user);
    if (!isValidId(providerId)) {
      return sendError(res, 400, "Provider profile not found for this user");
    }

    const { statementId } = req.params;
    if (!isValidId(statementId)) {
      return sendError(res, 400, "Invalid statement id");
    }

    const statement = await FinancialStatement.findOne({
      _id: statementId,
      provider: providerId,
    });

    if (!statement) {
      return sendError(res, 404, "Statement not found");
    }

    const csv = financialStatementToCsv(statement);

    const filename = `helpio-statement-${statement.year}-${String(
      statement.month
    ).padStart(2, "0")}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (err) {
    console.error("downloadMyStatementCsv error:", err);
    return sendError(res, 500, "Failed to generate CSV for statement");
  }
};

/**
 * Admin guard utility
 */
const ensureAdmin = (user) => {
  if (!user || !user.isAdmin) {
    const err = new Error("Admin access required");
    err.statusCode = 403;
    throw err;
  }
};

/**
 * Admin: Generate monthly statement for ANY provider.
 * POST /api/financial-statements/admin/generate/monthly
 * Body: { providerId, year, month, currency? }
 */
export const adminGenerateMonthlyStatementForProvider = async (req, res) => {
  try {
    ensureAdmin(req.user);

    const { providerId, year, month, currency } = req.body;

    if (!isValidId(providerId)) {
      return sendError(res, 400, "Invalid providerId");
    }

    if (!year || !month) {
      return sendError(res, 400, "year and month are required");
    }

    const statement = await computeAndPersistMonthlyStatement({
      providerId,
      year,
      month,
      currency,
      metadata: { generatedBy: "manual", source: "api:admin" },
    });

    return res.json({ success: true, statement });
  } catch (err) {
    console.error("adminGenerateMonthlyStatementForProvider error:", err);
    if (err.statusCode === 403) {
      return sendError(res, 403, "Admin access required");
    }
    return sendError(res, 500, "Failed to generate financial statement");
  }
};

/**
 * Admin: List statements for a provider (optionally year-filtered).
 * GET /api/financial-statements/admin/provider/:providerId?year=2025
 */
export const adminListStatementsForProvider = async (req, res) => {
  try {
    ensureAdmin(req.user);

    const { providerId } = req.params;
    const { year } = req.query;

    if (!isValidId(providerId)) {
      return sendError(res, 400, "Invalid providerId");
    }

    const filter = { provider: providerId };
    if (year) filter.year = Number(year);

    const statements = await FinancialStatement.find(filter)
      .sort({ year: -1, month: -1 })
      .lean();

    return res.json({ success: true, statements });
  } catch (err) {
    console.error("adminListStatementsForProvider error:", err);
    if (err.statusCode === 403) {
      return sendError(res, 403, "Admin access required");
    }
    return sendError(res, 500, "Failed to fetch financial statements");
  }
};
