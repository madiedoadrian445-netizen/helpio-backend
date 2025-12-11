// src/controllers/adminFraudController.js
import mongoose from "mongoose";
import FraudEvent from "../models/FraudEvent.js";

/* ---------------------- Util Helpers ---------------------- */

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
  const end = new Date(utcNow);

  switch (preset) {
    case "last24h":
      start.setTime(end.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "last7d":
      start.setTime(end.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "last30d":
      start.setTime(end.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      throw new Error("Unsupported range preset");
  }

  return { start, end };
};

/* ----------------------------------------------------------
   ⭐ GET /api/admin/fraud/events
---------------------------------------------------------- */

export const listFraudEvents = async (req, res) => {
  try {
    ensureAdmin(req.user);

    const {
      page = 1,
      limit = 50,
      riskLevel,
      riskAction,
      providerId,
      userId,
      ipAddress,
    } = req.query;

    const numericLimit = Math.min(Number(limit) || 50, 200);
    const numericPage = Math.max(Number(page) || 1, 1);

    const filter = {};

    // Must match FraudEvent schema fields
    if (riskLevel) filter.riskLevel = riskLevel;
    if (riskAction) filter.riskAction = riskAction;
    if (ipAddress) filter.ip = ipAddress;

    if (providerId && mongoose.Types.ObjectId.isValid(providerId)) {
      filter.provider = providerId;
    }

    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      filter.user = userId;
    }

    const [events, total] = await Promise.all([
      FraudEvent.find(filter)
        .sort({ createdAt: -1 })
        .skip((numericPage - 1) * numericLimit)
        .limit(numericLimit)
        .lean(),
      FraudEvent.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      page: numericPage,
      limit: numericLimit,
      total,
      events,
    });
  } catch (err) {
    console.error("listFraudEvents error:", err);
    if (err.statusCode === 403) {
      return sendError(res, 403, "Admin access required");
    }

    return sendError(res, 500, "Failed to fetch fraud events");
  }
};

/* ----------------------------------------------------------
   ⭐ GET /api/admin/fraud/summary
---------------------------------------------------------- */

export const getFraudSummary = async (req, res) => {
  try {
    ensureAdmin(req.user);

    const { range = "last24h" } = req.query;

    let start;
    let end;

    if (range === "custom") {
      const parsedStart = parseDate(req.query.start);
      const parsedEnd = parseDate(req.query.end);

      if (!parsedStart || !parsedEnd) {
        return sendError(res, 400, "Invalid custom start or end date");
      }

      start = parsedStart;
      end = parsedEnd;
    } else {
      ({ start, end } = buildPresetRange(range));
    }

    const matchStage = {
      createdAt: { $gte: start, $lt: end },
    };

    const agg = await FraudEvent.aggregate([
      { $match: matchStage },
      {
        $facet: {
          // Group by riskAction (allow / review / block)
          byAction: [
            {
              $group: {
                _id: "$riskAction",
                count: { $sum: 1 },
              },
            },
          ],
          // Group by riskLevel (low / medium / high)
          byLevel: [
            {
              $group: {
                _id: "$riskLevel",
                count: { $sum: 1 },
              },
            },
          ],
          // Total events in range
          total: [
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
    ]);

    const stats = agg[0] || {};

    return res.json({
      success: true,
      range: { start, end },
      totalEvents: stats.total?.[0]?.count || 0,
      byAction: stats.byAction || [],
      byLevel: stats.byLevel || [],
    });
  } catch (err) {
    console.error("getFraudSummary error:", err);
    if (err.statusCode === 403) {
      return sendError(res, 403, "Admin access required");
    }

    return sendError(res, 500, "Failed to compute fraud summary");
  }
};
