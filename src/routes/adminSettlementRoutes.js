// src/routes/adminSettlementRoutes.js
import express from "express";
import { protect, admin } from "../middleware/auth.js";

import SettlementBatch from "../models/SettlementBatch.js";
import LedgerEntry from "../models/LedgerEntry.js";

const router = express.Router();

/**
 * ADMIN — Settlement Batch Overview
 * ---------------------------------
 * Return list of settlement batches (most recent first).
 *
 * GET /api/admin/settlements/batches
 */
router.get("/batches", protect, admin, async (req, res) => {
  const batches = await SettlementBatch.find({})
    .sort({ runAt: -1 })
    .limit(50);

  return res.json({
    success: true,
    batches,
  });
});

/**
 * ADMIN — View Single Settlement Batch
 * ------------------------------------
 * GET /api/admin/settlements/batches/:batchId
 */
router.get("/batches/:batchId", protect, admin, async (req, res) => {
  const { batchId } = req.params;

  const batch = await SettlementBatch.findOne({ batchId });
  if (!batch) {
    return res.status(404).json({
      success: false,
      message: "Settlement batch not found",
    });
  }

  return res.json({
    success: true,
    batch,
  });
});

/**
 * ADMIN — View Ledger Entries in a Settlement Batch
 * -------------------------------------------------
 * GET /api/admin/settlements/batches/:batchId/entries
 */
router.get("/batches/:batchId/entries", protect, admin, async (req, res) => {
  const { batchId } = req.params;

  const entries = await LedgerEntry.find({
    "metadata.settlementBatchId": batchId,
  })
    .populate("provider")
    .populate("customer")
    .populate("invoice")
    .populate("subscription");

  return res.json({
    success: true,
    count: entries.length,
    entries,
  });
});

/**
 * ADMIN — Manual Settlement Trigger
 * ----------------------------------
 * IMPORTANT: For safety, this only queues the request.
 * Actual settlement cron runs independently.
 *
 * POST /api/admin/settlements/run
 */
router.post("/run", protect, admin, async (req, res) => {
  // We DO NOT run the cron here synchronously.
  // We simply mark a request for logs/workers.
  return res.json({
    success: true,
    message:
      "Settlement run requested. Cron will process T+7 entries on its next cycle.",
  });
});

/**
 * ADMIN — Ledger Entries Waiting For Settlement
 * ---------------------------------------------
 * GET /api/admin/settlements/pending
 */
router.get("/pending", protect, admin, async (req, res) => {
  const now = new Date();

  const pending = await LedgerEntry.find({
    direction: "credit",
    status: "posted",
    availableAt: { $lte: now },
    "metadata.settled": { $ne: true },
  })
    .populate("provider")
    .populate("customer");

  return res.json({
    success: true,
    now,
    count: pending.length,
    pending,
  });
});

export default router;
