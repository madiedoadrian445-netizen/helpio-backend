// src/utils/cronHealth.js
import CronJobStatus from "../models/CronJobStatus.js";

/**
 * Registry of all cron jobs we care about.
 * jobKey is stable and used in DB + API.
 */
export const CRON_JOBS = [
  {
    jobKey: "subscription_billing",
    jobName: "Subscription Billing Cron",
    schedule: "internal", // handled inside subscriptionBillingCron.js
    description: "Processes recurring subscription charges for Helpio.",
  },
  {
    jobKey: "nightly_balance_recalculation",
    jobName: "Nightly Balance Recalculation",
    schedule: "0 3 * * *",
    description: "Recalculates provider balances at 3:00 AM UTC daily.",
  },
  {
    jobKey: "auto_payout",
    jobName: "Auto Payout Cron",
    schedule: "0 4 * * *",
    description: "Runs auto payouts to providers at 4:00 AM UTC daily.",
  },
  {
    jobKey: "monthly_statements",
    jobName: "Monthly Statements Cron",
    schedule: "15 2 1 * *",
    description: "Generates monthly financial statements on the 1st at 2:15 AM UTC.",
  },
];

/**
 * Wrap a cron job handler so that every run is recorded in CronJobStatus.
 */
export const wrapCronJob = (jobKey, jobName, scheduleExpr, handler) => {
  return async () => {
    const startedAt = new Date();
    const startMs = Date.now();

    try {
      await handler();

      const duration = Date.now() - startMs;

      await CronJobStatus.findOneAndUpdate(
        { jobKey },
        {
          $set: {
            jobKey,
            jobName,
            schedule: scheduleExpr,
            lastRunAt: startedAt,
            lastSuccessAt: new Date(),
            lastStatus: "success",
            lastDurationMs: duration,
            lastErrorMessage: null,
          },
          $inc: { runsCount: 1 },
        },
        { upsert: true, new: true }
      );
    } catch (err) {
      const duration = Date.now() - startMs;

      await CronJobStatus.findOneAndUpdate(
        { jobKey },
        {
          $set: {
            jobKey,
            jobName,
            schedule: scheduleExpr,
            lastRunAt: startedAt,
            lastErrorAt: new Date(),
            lastStatus: "error",
            lastDurationMs: duration,
            lastErrorMessage: err?.message || "Unknown error",
          },
          $inc: { runsCount: 1 },
        },
        { upsert: true, new: true }
      );

      // Re-throw so your cron scheduler still logs / surfaces the error
      throw err;
    }
  };
};

/**
 * Merge the CronJobStatus docs with the static registry so even jobs
 * that haven't run yet show up.
 */
export const mergeCronStatuses = (statuses = []) => {
  const map = new Map();
  statuses.forEach((s) => map.set(s.jobKey, s));

  return CRON_JOBS.map((job) => {
    const db = map.get(job.jobKey);
    if (!db) {
      return {
        ...job,
        lastRunAt: null,
        lastSuccessAt: null,
        lastErrorAt: null,
        lastDurationMs: null,
        lastErrorMessage: null,
        lastStatus: "never",
        runsCount: 0,
      };
    }

    return {
      ...job,
      lastRunAt: db.lastRunAt || null,
      lastSuccessAt: db.lastSuccessAt || null,
      lastErrorAt: db.lastErrorAt || null,
      lastDurationMs: db.lastDurationMs || null,
      lastErrorMessage: db.lastErrorMessage || null,
      lastStatus: db.lastStatus || "never",
      runsCount: db.runsCount || 0,
      updatedAt: db.updatedAt,
      createdAt: db.createdAt,
    };
  });
};
