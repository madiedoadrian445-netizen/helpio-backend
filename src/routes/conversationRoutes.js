import express from "express";
import { protect } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
import {
  getOrCreateConversationWithCustomer,
  listMyConversations,
  getConversationById,
  markConversationRead,
} from "../controllers/conversationController.js";

const router = express.Router();

/**
 * Create or fetch a conversation from a SERVICE listing
 * Customer → Provider
 */
router.post(
  "/with-service/:providerId",
  protect,
  validateObjectId("providerId"),
  getOrCreateConversationWithCustomer
);

/**
 * Create or fetch a conversation from CRM (no service context)
 * Provider → Customer
 */
router.post(
  "/with-customer/:customerId",
  protect,
  validateObjectId("customerId"),
  getOrCreateConversationWithCustomer
);


/**
 * List all conversations for the logged-in user
 * (provider OR customer)
 */
router.get("/", protect, listMyConversations);

/**
 * Get a single conversation by ID
 * (provider OR customer)
 */
router.get(
  "/:conversationId",
  protect,
  validateObjectId("conversationId"),
  getConversationById
);

/**
 * Mark a conversation as read
 */
router.post(
  "/:conversationId/read",
  protect,
  validateObjectId("conversationId"),
  markConversationRead
);

export default router;
