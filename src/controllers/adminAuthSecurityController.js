// src/controllers/adminAuthSecurityController.js
import mongoose from "mongoose";
import { AuthEvent } from "../models/AuthEvent.js";

const { Types } = mongoose;

/**
 * Simple admin guard helper
 */
const ensureAdmin = (req, res) => {
  if (!req.user || req.user.role !== "admin") {
    res.status(403).json({
      success: false,
      message: "Admin access only",
    });
    return false;
  }
  return true;
};

/**
 * Compute "since" date based on ?window= parameter
 * window can be: "24h", "7d", "30d" (default: 24h)
 */
const computeSinceDate = (window = "24h") => {
  const now = new Date();
  const w = String(window).toLowerCase();

  if (w === "7d") {
    now.setDate(now.getDate() - 7);
  } else if (w === "30d") {
    now.setDate(now.getDate() - 30);
  } else {
    // default 24h
    now.setHours(now.getHours() - 24);
  }

  return now;
};

/* -----------------------------------------------------------
   GET /api/admin/auth-security/summary
   - Returns aggregate stats for recent auth events
----------------------------------------------------------- */
export const getAuthSecuritySummary = async (req, res, next) => {
  try {
    if (!ensureAdmin(req, res)) return;

    const { window } = req.query;
    const since = computeSinceDate(window);

    const pipeline = [
      {
        $match: {
          createdAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
        },
      },
    ];

    const results = await AuthEvent.aggregate(pipeline).exec();

    const summary = {
      window: window || "24h",
      since,
      totals: {
        login_success: 0,
        login_failed: 0,
        logout: 0,
        register: 0,
        token_refreshed: 0,
        password_reset_requested: 0,
        password_reset_email_sent: 0,
        password_reset_success: 0,
        password_reset_failed: 0,
        mfa_challenge_started: 0,
        mfa_challenge_verified: 0,
        mfa_challenge_failed: 0,
      },
    };

    for (const row of results) {
      if (summary.totals.hasOwnProperty(row._id)) {
        summary.totals[row._id] = row.count;
      }
    }

    // Top failed login IPs (last window)
    const failedLoginAgg = await AuthEvent.aggregate([
      {
        $match: {
          type: "login_failed",
          createdAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: "$ip",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    summary.topFailedLoginIps = failedLoginAgg.map((ipRow) => ({
      ip: ipRow._id,
      count: ipRow.count,
    }));

    // Top failed login emails (last window)
    const failedLoginEmailAgg = await AuthEvent.aggregate([
      {
        $match: {
          type: "login_failed",
          createdAt: { $gte: since },
          email: { $ne: null },
        },
      },
      {
        $group: {
          _id: "$email",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    summary.topFailedLoginEmails = failedLoginEmailAgg.map((row) => ({
      email: row._id,
      count: row.count,
    }));

    return res.json({
      success: true,
      summary,
    });
  } catch (err) {
    next(err);
  }
};

/* -----------------------------------------------------------
   GET /api/admin/auth-security/events
   - Paginated recent auth events with filters
   Query params:
     ?type=login_failed
     ?email=test@example.com
     ?userId=<mongoId>
     ?limit=50
     ?page=1
----------------------------------------------------------- */
export const getAuthEvents = async (req, res, next) => {
  try {
    if (!ensureAdmin(req, res)) return;

    const {
      type,
      email,
      userId,
      limit = 50,
      page = 1,
      from,
      to,
    } = req.query;

    const query = {};

    if (type) {
      query.type = type;
    }

    if (email) {
      query.email = email.toLowerCase();
    }

    if (userId && Types.ObjectId.isValid(userId)) {
      query.user = new Types.ObjectId(userId);
    }

    if (from || to) {
      query.createdAt = {};
      if (from) {
        query.createdAt.$gte = new Date(from);
      }
      if (to) {
        query.createdAt.$lte = new Date(to);
      }
    }

    const numericLimit = Math.min(Number(limit) || 50, 200);
    const numericPage = Math.max(Number(page) || 1, 1);

    const [events, total] = await Promise.all([
      AuthEvent.find(query)
        .sort({ createdAt: -1 })
        .skip((numericPage - 1) * numericLimit)
        .limit(numericLimit)
        .lean(),
      AuthEvent.countDocuments(query),
    ]);

    return res.json({
      success: true,
      page: numericPage,
      limit: numericLimit,
      total,
      events,
    });
  } catch (err) {
    next(err);
  }
};

/* -----------------------------------------------------------
   GET /api/admin/auth-security/user/:userId
   - Timeline of auth events for a specific user
----------------------------------------------------------- */
export const getUserAuthTimeline = async (req, res, next) => {
  try {
    if (!ensureAdmin(req, res)) return;

    const { userId } = req.params;

    if (!Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid userId",
      });
    }

    const events = await AuthEvent.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return res.json({
      success: true,
      userId,
      events,
    });
  } catch (err) {
    next(err);
  }
};
