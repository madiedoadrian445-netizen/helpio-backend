import express from "express";
import { protect } from "../middleware/auth.js"; // Only allow authenticated
import { getWebhookEvents } from "../controllers/webhookEventLogController.js";

const router = express.Router();

/**
 * GET /api/webhooks/events
 */
router.get("/events", protect, getWebhookEvents);

export default router;
