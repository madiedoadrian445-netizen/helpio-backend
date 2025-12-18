import express from "express";
import { protect } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
import {
  listMessages,
  sendMessage,
} from "../controllers/messageController.js";

// 👇 reuse the SAME logic
import { markConversationRead } from "../controllers/conversationController.js";

const router = express.Router();

router.get(
  "/:conversationId",
  protect,
  validateObjectId("conversationId"),
  listMessages
);

router.post(
  "/:conversationId",
  protect,
  validateObjectId("conversationId"),
  sendMessage
);

// 🔑 THIS IS THE MISSING PIECE
router.post(
  "/:conversationId/read",
  protect,
  validateObjectId("conversationId"),
  markConversationRead
);

export default router;
