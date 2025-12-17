import express from "express";
import { protect } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
import {
  getOrCreateConversationWithCustomer,
  listMyConversations,
  getConversationById,
  markConversationReadAsProvider,
} from "../controllers/conversationController.js";

const router = express.Router();

router.post(
  "/with-service/:providerId",
  protect,
  validateObjectId("providerId"),
  getOrCreateConversationWithCustomer
);

router.get("/", protect, listMyConversations);

router.get(
  "/:conversationId",
  protect,
  validateObjectId("conversationId"),
  getConversationById
);

router.post(
  "/:conversationId/read",
  protect,
  validateObjectId("conversationId"),
  markConversationReadAsProvider
);

export default router;
