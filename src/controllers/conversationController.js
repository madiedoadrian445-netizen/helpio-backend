import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

/**
 * 🔧 Adjust this ONE function if your auth shape differs.
 */
const getProviderId = (req) =>
  req.user?.providerId || req.user?.provider?._id || req.user?._id || null;

export const getOrCreateConversationWithCustomer = async (req, res) => {
  try {
    const providerId = getProviderId(req);
    const { customerId } = req.params;
    if (!providerId) return sendError(res, 401, "Unauthorized.");

    let convo = await Conversation.findOne({ providerId, customerId });

    if (!convo) {
      convo = await Conversation.create({
        providerId,
        customerId,
        lastMessageAt: null,
        lastMessageText: "",
        lastMessageSenderRole: "provider",
        providerLastReadAt: new Date(), // provider just opened it
        customerLastReadAt: null,
      });
    } else {
      // opening chat counts as “read” for provider (optional, but iMessage-like)
      convo.providerLastReadAt = new Date();
      await convo.save();
    }

    return res.json({ success: true, conversation: convo });
  } catch (err) {
    // race condition safe: unique index can throw 11000
    if (err?.code === 11000) {
      const providerId = getProviderId(req);
      const { customerId } = req.params;
      const convo = await Conversation.findOne({ providerId, customerId });
      return res.json({ success: true, conversation: convo });
    }
    console.log("❌ getOrCreateConversationWithCustomer:", err);
    return sendError(res, 500, "Server error.");
  }
};

export const listMyConversations = async (req, res) => {
  try {
    const providerId = getProviderId(req);
    if (!providerId) return sendError(res, 401, "Unauthorized.");

    const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);
    const includeArchived = req.query.includeArchived === "true";

    const q = { providerId };
    if (!includeArchived) q.providerArchivedAt = null;

    const conversations = await Conversation.find(q)
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .limit(limit)
      .lean();

    // iMessage-style unread computation
    const withUnread = conversations.map((c) => {
      const last = c.lastMessageAt ? new Date(c.lastMessageAt).getTime() : 0;
      const read = c.providerLastReadAt ? new Date(c.providerLastReadAt).getTime() : 0;
      const unread = last > read && c.lastMessageSenderRole === "customer";
      return { ...c, unread };
    });

    return res.json({ success: true, conversations: withUnread });
  } catch (err) {
    console.log("❌ listMyConversations:", err);
    return sendError(res, 500, "Server error.");
  }
};

export const getConversationById = async (req, res) => {
  try {
    const providerId = getProviderId(req);
    const { conversationId } = req.params;
    if (!providerId) return sendError(res, 401, "Unauthorized.");

    const convo = await Conversation.findOne({ _id: conversationId, providerId });
    if (!convo) return sendError(res, 404, "Conversation not found.");

    return res.json({ success: true, conversation: convo });
  } catch (err) {
    console.log("❌ getConversationById:", err);
    return sendError(res, 500, "Server error.");
  }
};

export const markConversationReadAsProvider = async (req, res) => {
  try {
    const providerId = getProviderId(req);
    const { conversationId } = req.params;
    if (!providerId) return sendError(res, 401, "Unauthorized.");

    const convo = await Conversation.findOne({ _id: conversationId, providerId });
    if (!convo) return sendError(res, 404, "Conversation not found.");

    const now = new Date();

    convo.providerLastReadAt = now;
    await convo.save();

    // Stamp readAt for incoming (customer) messages that are unread
    await Message.updateMany(
      { conversationId, senderRole: "customer", readAt: null },
      { $set: { readAt: now } }
    );

    return res.json({ success: true, providerLastReadAt: now });
  } catch (err) {
    console.log("❌ markConversationReadAsProvider:", err);
    return sendError(res, 500, "Server error.");
  }
};
