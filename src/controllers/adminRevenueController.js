// src/controllers/adminRevenueController.js
import mongoose from "mongoose";
import { getRevenueSummaryForRange } from "../utils/revenueAnalytics.js";

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

const ensureAdmin = (user) => {
  if (!user || !user.isAdmin) {
    const err = new Error("Admin access required");
    err.statusCode = 403;
    throw err;
  }
};

const parseDate = (value) => {
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Build a date range from a preset key.
 *
 * Supported presets:
 *  - today
 *  - last7d
 *  - last30d
 *  - mtd        (month to date)
 *  - ytd        (year to date)
 */
const buildPresetRange = (preset) => {
  const now = new Date();
  const utcNow = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds()
    )
  );

  const start = new Date(utcNow);
  let end = new Date(utcNow);

  switch (preset) {
    case "today": {
      start.setUTCHours(0, 0, 0, 0);
      end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      break;
    }

    case "last7d": {
      end.setUTCHours(0, 0, 0, 0);
      start.setUTCHours(0, 0, 0, 0);
      start.setUTCDate(start.getUTCDate() - 7);
      break;
    }

    case "last30d": {
      end.setUTCHours(0, 0, 0, 0);
      start.setUTCHours(0, 0, 0, 0);
      start.setUTCDate(start.getUTCDate() - 30);
      break;
    }

    case "mtd": {
      start.setUTCDate(1);
      start.setUTCHours(0, 0, 0, 0);
      end = new Date(utcNow);
      end.setUTCDate(end.getUTCDate() + 1);
      break;
    }

    case "ytd": {
      start.setUTCMonth(0, 1); // Jan 1
      start.setUTCHours(0, 0, 0, 0);
      end = new Date(utcNow);
      end.setUTCDate(end.getUTCDate() + 1);
      break;
    }

    default:
      throw new Error("Unsupported range preset");
  }

  return { start, end };
};

/**
 * GET /api/admin/revenue/summary
 *
 * Query params:
 *  - range: "today" | "last7d" | "last30d" | "mtd" | "ytd"
 * OR:
 *  - start: ISO date string
 *  - end:   ISO date string
 *
 * Optional:
 *  - currency: "usd" (default) or other supported currency
 */
export const getRevenueSummary = async (req, res) => {
  try {
    ensureAdmin(req.user);

    const { range, start: startStr, end: endStr, currency } = req.query;

    let start;
    let end;

    if (range) {
      ({ start, end } = buildPresetRange(range));
    } else if (startStr && endStr) {
      const parsedStart = parseDate(startStr);
      const parsedEnd = parseDate(endStr);

      if (!parsedStart || !parsedEnd) {
        return sendError(res, 400, "Invalid start or end date");
      }

      start = parsedStart;
      end = parsedEnd;
    } else {
      // default: last 30 days
      ({ start, end } = buildPresetRange("last30d"));
    }

    const summary = await getRevenueSummaryForRange({
      start,
      end,
      currency,
    });

    return res.json({
      success: true,
      range: {
        start: summary.range.start,
        end: summary.range.end,
      },
      currency: summary.currency,
      metrics: summary.metrics,
    });
  } catch (err) {
    console.error("getRevenueSummary error:", err);
    if (err.statusCode === 403) {
      return sendError(res, 403, "Admin access required");
    }
    return sendError(res, 500, "Failed to compute revenue summary");
  }
};
