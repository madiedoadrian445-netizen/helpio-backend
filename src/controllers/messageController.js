import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

/**
 * Resolve sender role and id safely
 */
const getSenderContext = (req) => {
  if (req.user?.providerId) {
    return {
      role: "provider",
      senderId: req.user.providerId,
    };
  }

  if (req.user?._id) {
    return {
      role: "customer",
      senderId: req.user._id,
    };
  }

  return null;
};

/**
 * GET /api/messages/:conversationId
 * Cursor pagination via ?before=<ISO>
 * Returns messages oldest → newest
 */
export const listMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const sender = getSenderContext(req);

    if (!sender) return sendError(res, 401, "Unauthorized.");

    // Role-aware conversation access
    const convo = await Conversation.findById(conversationId);

if (!convo) {
  return sendError(res, 404, "Conversation not found.");
}

// 🔐 Hard permission check
if (
  (sender.role === "provider" && String(convo.providerId) !== String(sender.senderId)) ||
  (sender.role === "customer" && String(convo.customerId) !== String(sender.senderId))
) {
  return sendError(res, 403, "Access denied.");
}


    if (!convo) return sendError(res, 404, "Conversation not found.");

    const limit = Math.min(parseInt(req.query.limit || "40", 10), 100);
    const before = req.query.before ? new Date(req.query.before) : null;

    const q = { conversation: conversationId };
    if (before && !isNaN(before.getTime())) {
      q.createdAt = { $lt: before };
    }

    // Fetch newest first, then reverse for UI
    const batch = await Message.find(q)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const messages = batch.reverse();

    const nextBefore =
      batch.length === limit ? batch[batch.length - 1].createdAt : null;

    return res.json({
      success: true,
      messages,
      nextBefore,
    });
  } catch (err) {
    console.log("❌ listMessages:", err);
    return sendError(res, 500, "Server error.");
  }
};

/**
 * POST /api/messages/:conversationId
 * Body: { text?, imageUrls? }
 */
export const sendMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const sender = getSenderContext(req);

    if (!sender) return sendError(res, 401, "Unauthorized.");

    // Role-aware conversation access
   const convo = await Conversation.findById(conversationId);

if (!convo) {
  return sendError(res, 404, "Conversation not found.");
}

// 🔐 Hard permission check (EXACT MATCH with listMessages)
if (
  (sender.role === "provider" &&
    String(convo.providerId) !== String(sender.senderId)) ||
  (sender.role === "customer" &&
    String(convo.customerId) !== String(sender.senderId))
) {
  return sendError(res, 403, "Access denied.");
}

    if (!convo) return sendError(res, 404, "Conversation not found.");

    const { text, imageUrls } = req.body || {};

    const cleanText = typeof text === "string" ? text.trim() : "";
    const isImage = Array.isArray(imageUrls) && imageUrls.length > 0;

    if (!cleanText && !isImage) {
      return sendError(res, 400, "Message text or images are required.");
    }

    const now = new Date();

    const msg = await Message.create({
      conversation: conversationId, // ✅ correct field
      sender: sender.senderId,
      senderRole: sender.role,

      text: cleanText,
      imageUrls: isImage ? imageUrls.slice(0, 12) : [],

      deliveredAt: now,
      readAt: null,
    });

console.log("🧪 convo.providerId:", convo.providerId);
console.log("🧪 convo.customerId:", convo.customerId);
console.log("🧪 sender:", sender);


    // Update conversation summary (used by Messages list)
    convo.lastMessageAt = now;
    convo.lastMessageSenderRole = sender.role;
    convo.lastMessageText = isImage
      ? `📷 Photo${imageUrls.length > 1 ? "s" : ""}`
      : cleanText.slice(0, 200);

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
