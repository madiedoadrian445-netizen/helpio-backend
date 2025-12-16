import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

/**
 * 🔧 Adjust this ONE function if your auth shape differs.
 */
const getProviderId = (req) => {
  if (!req.user?.providerId) return null;
  return req.user.providerId;
};


export const getOrCreateConversationWithCustomer = async (req, res) => {
  try {
    const providerId = getProviderId(req);
   const { customerId } = req.params;
const { serviceId } = req.body;

if (!serviceId) {
  return sendError(res, 400, "serviceId is required.");
}

    if (!providerId) return sendError(res, 401, "Unauthorized.");

   let convo = await Conversation.findOne({
  providerId,
  customerId,
  serviceId,
});


    if (!convo) {
      const now = new Date();

convo = await Conversation.create({
  providerId,
  customerId,
  serviceId,


  // 🔥 THIS IS THE KEY LINE
  lastMessageAt: now,

  lastMessageText: "Conversation started",
  lastMessageSenderRole: "system",

  providerLastReadAt: now,
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
    const { serviceId } = req.body;

    const convo = await Conversation.findOne({
      providerId,
      customerId,
      serviceId,
    });

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
  .populate("customerId", "name avatar phone")
  .populate("serviceId", "title photos")
  .sort({
    lastMessageAt: -1,
    createdAt: -1,
    updatedAt: -1,
  })
  .limit(limit)
  .lean();


    // iMessage-style unread computation
   const withUnread = conversations.map((c) => {
  const last = c.lastMessageAt ? new Date(c.lastMessageAt).getTime() : 0;
  const read = c.providerLastReadAt
    ? new Date(c.providerLastReadAt).getTime()
    : 0;

  const unread =
    last > read && c.lastMessageSenderRole === "customer";

  return {
    _id: c._id,

    customerId: c.customerId?._id || c.customerId,
    serviceId: c.serviceId?._id || null,

    // 🔥 SERVICE DATA (for MessagesScreen)
    serviceTitle: c.serviceId?.title || null,
    serviceThumbnail: c.serviceId?.photos?.[0] || null,

    // 🔥 CUSTOMER DATA
    customer: c.customerId
      ? {
          name: c.customerId.name,
          avatar: c.customerId.avatar,
          phone: c.customerId.phone,
        }
      : null,

    lastMessageText: c.lastMessageText || "",
    unread,
    updatedAt: c.updatedAt,
  };
});

    return res.json({ success: true, conversations: withUnread });
  } catch (err) {
    console.log("❌ listMyConversations:", err);
    return sendError(res, 500, "Server error.");
  }
};

export const getConversationMeta = async (req, res) => {
  try {
    const providerId = getProviderId(req);
    const { conversationId } = req.params;
    if (!providerId) return sendError(res, 401, "Unauthorized.");

    const convo = await Conversation.findOne(
      { _id: conversationId, providerId },
      "customerId"
    );

    if (!convo) return sendError(res, 404, "Conversation not found.");

    return res.json({
      success: true,
      customerId: convo.customerId,
    });
  } catch (err) {
    console.log("❌ getConversationMeta:", err);
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
