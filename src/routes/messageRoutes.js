// src/routes/messageRoutes.js
import express from "express";
import { protect } from "../middleware/auth.js";
import {
  getMessagesForConversation,
  sendMessage,
} from "../controllers/messageController.js";

const router = express.Router();

/**
 * GET /api/conversations/:conversationId/messages
 */
router.get(
  "/:conversationId/messages",
  protect,
  getMessagesForConversation
);

/**
 * POST /api/conversations/:conversationId/messages
 */
router.post(
  "/:conversationId/messages",
  protect,
  sendMessage
);

export default router;
