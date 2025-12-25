import express from "express";
import { protect } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
import {
  listMessages,
  sendMessage,
} from "../controllers/messageController.js";

// 👇 reuse the SAME logic
import { markMessagesRead } from "../controllers/messageController.js";


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
  markMessagesRead
);


export default router;
