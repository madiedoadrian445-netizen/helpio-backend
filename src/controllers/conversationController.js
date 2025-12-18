import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import { Listing } from "../models/Listing.js";


const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

/**
 * 🔧 Adjust this ONE function if your auth shape differs.
 */
const getProviderId = (req) => {
  if (!req.user?.providerId) return null;
  return req.user.providerId;
};

const getConversationAccessQuery = (req, conversationId) => {
  // Provider view
  if (req.user?.providerId) {
    return { _id: conversationId, providerId: req.user.providerId };
  }

  // Customer view
  return { _id: conversationId, customerId: req.user._id };
};


export const getOrCreateConversationWithCustomer = async (req, res) => {
  try {
    const providerId = req.params.providerId;   // ✅ TARGET PROVIDER
    const customerId = req.user._id;             // ✅ CUSTOMER
    const { serviceId } = req.body;

    if (!providerId || !customerId) {
      return sendError(res, 401, "Unauthorized.");
    }

    if (!serviceId) {
      return sendError(res, 400, "serviceId is required.");
    }

    // 🔥 Validate listing is live
    const listing = await Listing.findById(serviceId).select("_id isActive");

    if (!listing || listing.isActive === false) {
      return sendError(
        res,
        404,
        "Messaging is only available for live listings."
      );
    }

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
        lastMessageAt: now,
        lastMessageText: "Conversation started",
        lastMessageSenderRole: "system",
        providerLastReadAt: now,
        customerLastReadAt: null,
      });
    } else {
      convo.providerLastReadAt = new Date();
      await convo.save();
    }

    return res.json({ success: true, conversation: convo });
  } catch (err) {
    console.log("❌ getOrCreateConversationWithCustomer:", err);
    return sendError(res, 500, "Server error.");
  }
};

export const listMyConversations = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);
    const includeArchived = req.query.includeArchived === "true";

    const isProvider = !!req.user?.providerId;

    const q = isProvider
      ? { providerId: req.user.providerId }
      : { customerId: req.user._id };

    // Optional archive handling (only if your schema has both fields)
    if (!includeArchived) {
      if (isProvider) q.providerArchivedAt = null;
      else q.customerArchivedAt = null;
    }

    const conversations = await Conversation.find(q)
      .populate("customerId", "name avatar phone")
      .populate("serviceId", "title photos")
      .sort({ lastMessageAt: -1, createdAt: -1, updatedAt: -1 })
      .limit(limit)
      .lean();

    const withUnread = conversations.map((c) => {
      const last = c.lastMessageAt ? new Date(c.lastMessageAt).getTime() : 0;

      const read = isProvider
        ? c.providerLastReadAt
          ? new Date(c.providerLastReadAt).getTime()
          : 0
        : c.customerLastReadAt
          ? new Date(c.customerLastReadAt).getTime()
          : 0;

      const unread =
        last > read &&
        c.lastMessageSenderRole === (isProvider ? "customer" : "provider");

      return {
        _id: c._id,

        customerId: c.customerId?._id || c.customerId,
        serviceId: c.serviceId?._id || null,

        serviceTitle: c.serviceId?.title || null,
        serviceThumbnail: c.serviceId?.photos?.[0] || null,

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
    const { conversationId } = req.params;

    const or = [];
    if (req.user?.providerId) or.push({ providerId: req.user.providerId });
    if (req.user?._id) or.push({ customerId: req.user._id });

    const convo = await Conversation.findOne({
      _id: conversationId,
      $or: or,
    });

    if (!convo) {
      return sendError(res, 404, "Conversation not found.");
    }

    return res.json({ success: true, conversation: convo });
  } catch (err) {
    console.log("❌ getConversationById:", err);
    return sendError(res, 500, "Server error.");
  }
};



export const markConversationRead = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const or = [];
    if (req.user?.providerId) or.push({ providerId: req.user.providerId });
    if (req.user?._id) or.push({ customerId: req.user._id });

    const convo = await Conversation.findOne({
      _id: conversationId,
      $or: or,
    });

    if (!convo) {
      return sendError(res, 404, "Conversation not found.");
    }

    const now = new Date();

    if (req.user?.providerId) {
      convo.providerLastReadAt = now;
    } else {
      convo.customerLastReadAt = now;
    }

    await convo.save();

   await Message.updateMany(
  {
    conversation: conversationId, // ✅ CORRECT
    senderRole: req.user?.providerId ? "customer" : "provider",
    readAt: null,
  },
  { $set: { readAt: now } }
);


    return res.json({ success: true });
  } catch (err) {
    console.log("❌ markConversationRead:", err);
    return sendError(res, 500, "Server error.");
  }
};
