import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

/**
 * Resolve sender role using the CONVERSATION (not JWT claims)
 */
/**
 * Resolve sender role STRICTLY from authenticated user
 * NEVER from conversation ownership
 */
const getSenderContext = (req) => {
  if (!req.user) return null;

  if (req.user.providerId) {
    return {
      role: "provider",
      senderId: req.user.providerId,
    };
  }

  return {
    role: "customer",
    senderId: req.user._id,
  };
};

/**
 * GET /api/messages/:conversationId
 * Cursor pagination via ?before=<ISO>
 */
export const listMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const convo = await Conversation.findById(conversationId);
    if (!convo) return sendError(res, 404, "Conversation not found.");

    const sender = getSenderContext(req);

    if (!sender) return sendError(res, 403, "Access denied.");

    const limit = Math.min(parseInt(req.query.limit || "40", 10), 100);
    const before = req.query.before ? new Date(req.query.before) : null;

    // ✅ FIX: use schema field
    const q = { conversationId };
    if (before && !isNaN(before.getTime())) {
      q.createdAt = { $lt: before };
    }

    const batch = await Message.find(q)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      messages: batch.reverse(),
      nextBefore:
        batch.length === limit ? batch[batch.length - 1].createdAt : null,
    });
  } catch (err) {
    console.log("❌ listMessages:", err);
    return sendError(res, 500, "Server error.");
  }
};

/**
 * POST /api/messages/:conversationId
 */
export const sendMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const convo = await Conversation.findById(conversationId);
    if (!convo) return sendError(res, 404, "Conversation not found.");

   const sender = getSenderContext(req);
    if (!sender) return sendError(res, 403, "Access denied.");

    const { text, imageUrls } = req.body || {};
    const cleanText = typeof text === "string" ? text.trim() : "";
    const isImage = Array.isArray(imageUrls) && imageUrls.length > 0;

    if (!cleanText && !isImage) {
      return sendError(res, 400, "Message text or images are required.");
    }

    const now = new Date();

    // ✅ FIX: match Message schema EXACTLY
    const msg = await Message.create({
      conversationId: conversationId,
      providerId: convo.providerId,
      customerId: convo.customerId,

      senderId: sender.senderId,
      senderRole: sender.role,

      text: cleanText,
      imageUrls: isImage ? imageUrls.slice(0, 12) : [],

      deliveredAt: now,
      readAt: null,
    });

   convo.lastMessageAt = now;
convo.lastMessageSenderRole = sender.role;
convo.lastMessageText = isImage
  ? `📷 Photo${imageUrls.length > 1 ? "s" : ""}`
  : cleanText.slice(0, 200);

// 🔥 CRITICAL FIX — forces it into Messages list
convo.updatedAt = now;

await convo.save();


    return res.status(201).json({
      success: true,
      message: msg,
    });
  } catch (err) {
    console.log("❌ sendMessage:", err);
    return sendError(res, 500, "Server error.");
  }
};
