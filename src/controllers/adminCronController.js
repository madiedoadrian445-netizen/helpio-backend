// src/controllers/adminCronController.js
import CronJobStatus from "../models/CronJobStatus.js";
import { CRON_JOBS, mergeCronStatuses } from "../utils/cronHealth.js";

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

const ensureAdmin = (user) => {
  if (!user || !user.isAdmin) {
    const err = new Error("Admin access required");
    err.statusCode = 403;
    throw err;
  }
};

/**
 * GET /api/admin/cron/health
 *
 * Returns all known cron jobs with their latest status.
 */
export const getCronHealth = async (req, res) => {
  try {
    ensureAdmin(req.user);

    const statuses = await CronJobStatus.find({}).lean();
    const merged = mergeCronStatuses(statuses);

    return res.json({
      success: true,
      jobs: merged,
    });
  } catch (err) {
    console.error("getCronHealth error:", err);
    if (err.statusCode === 403) {
      return sendError(res, 403, "Admin access required");
    }
    return sendError(res, 500, "Failed to fetch cron health");
  }
};

/**
 * GET /api/admin/cron/health/:jobKey
 */
export const getCronJobHealth = async (req, res) => {
  try {
    ensureAdmin(req.user);

    const { jobKey } = req.params;

    const jobDef = CRON_JOBS.find((j) => j.jobKey === jobKey);
    if (!jobDef) {
      return sendError(res, 404, "Unknown cron job key");
    }

    const status = await CronJobStatus.findOne({ jobKey }).lean();

    const merged = mergeCronStatuses(status ? [status] : []).find(
      (j) => j.jobKey === jobKey
    );

    return res.json({
      success: true,
      job: merged,
    });
  } catch (err) {
    console.error("getCronJobHealth error:", err);
    if (err.statusCode === 403) {
      return sendError(res, 403, "Admin access required");
    }
    return sendError(res, 500, "Failed to fetch cron job health");
  }
};
