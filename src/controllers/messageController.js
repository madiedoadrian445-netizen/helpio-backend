import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

const getProviderId = (req) =>
  req.user?.providerId || req.user?.provider?._id || req.user?._id || null;

// Cursor pagination: use `before` (ISO date). Returns messages oldest→newest.
export const getMessagesForConversation = async (req, res) => {
  try {
    const providerId = getProviderId(req);
    const { conversationId } = req.params;
    if (!providerId) return sendError(res, 401, "Unauthorized.");

    const convo = await Conversation.findOne({ _id: conversationId, providerId });
    if (!convo) return sendError(res, 404, "Conversation not found.");

    const limit = Math.min(parseInt(req.query.limit || "40", 10), 100);
    const before = req.query.before ? new Date(req.query.before) : null;

    const q = { conversationId };
    if (before && !isNaN(before.getTime())) {
      q.createdAt = { $lt: before };
    }

    // Fetch newest first, then reverse to oldest->newest for UI
    const batch = await Message.find(q)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const messages = batch.reverse();

    const nextCursor =
      batch.length === limit ? batch[batch.length - 1].createdAt : null;

    return res.json({ success: true, messages, nextCursor });
  } catch (err) {
    console.log("❌ listMessagesForConversation:", err);
    return sendError(res, 500, "Server error.");
  }
};

export const sendMessage = async (req, res) => {
  try {
    const providerId = getProviderId(req);
    const { conversationId } = req.params;
    if (!providerId) return sendError(res, 401, "Unauthorized.");

    const convo = await Conversation.findOne({ _id: conversationId, providerId });
    if (!convo) return sendError(res, 404, "Conversation not found.");

    const { text, type, imageUrls } = req.body || {};

    const finalType = type || (Array.isArray(imageUrls) && imageUrls.length ? "image" : "text");
    const cleanText = typeof text === "string" ? text.trim() : "";

    if (finalType === "text" && !cleanText) {
      return sendError(res, 400, "Message text is required.");
    }

    if (finalType === "image") {
      if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
        return sendError(res, 400, "imageUrls[] is required for image messages.");
      }
    }

    const now = new Date();

    const msg = await Message.create({
      conversationId,
      providerId: convo.providerId,
      customerId: convo.customerId,

      senderRole: "provider",
      senderId: providerId,

      type: finalType,
      text: finalType === "text" ? cleanText : "",
      imageUrls: finalType === "image" ? imageUrls.slice(0, 12) : [],

      deliveredAt: now,
      readAt: null,
    });

    // Update convo summary for list UI (iMessage list)
    convo.lastMessageAt = now;
    convo.lastMessageSenderRole = "provider";
    convo.lastMessageText =
      finalType === "text"
        ? cleanText
        : `📷 Photo${msg.imageUrls.length > 1 ? "s" : ""}`;
    await convo.save();

    return res.status(201).json({ success: true, message: msg });
  } catch (err) {
    console.log("❌ sendMessageInConversation:", err);
    return sendError(res, 500, "Server error.");
  }
};

