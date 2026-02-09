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

/* =========================================================
   CREATE OR FETCH CONVERSATION
   ========================================================= */
export const getOrCreateConversationWithCustomer = async (req, res) => {
  try {
    const providerId =
      req.params.providerId || req.user?.providerId;

    const customerId =
      req.params.customerId || req.user?._id;

    const { serviceId } = req.body;

    if (!providerId || !customerId) {
      return sendError(res, 401, "Unauthorized.");
    }

    /* ===============================
       SERVICE-BASED CONVERSATION
       =============================== */
    if (serviceId) {
  const listing = await Listing.findById(serviceId)
  .select("_id isActive businessName title photos")
  .lean();


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

      const now = new Date();

      if (!convo) {
       convo = await Conversation.create({
  providerId,
  customerId,
  serviceId,

  // ⭐ store snapshot for safety (optional but good)
  businessName: listing?.businessName || null,

  lastMessageAt: now,
  lastMessageText: "Conversation started",
  lastMessageSenderRole: "customer",

  providerLastReadAt: null,
  customerLastReadAt: now,
});


      } else {
        // 🔥 CRITICAL FIX — ensures it shows in Messages list
        convo.lastMessageAt = now;
        convo.updatedAt = now;
        await convo.save();
      }

      return res.json({ success: true, conversation: convo });
    }

    /* ===============================
       CRM-BASED CONVERSATION
       =============================== */
    let convo = await Conversation.findOne({
      providerId,
      customerId,
      serviceId: null,
    });

    if (!convo) {
      const now = new Date();

   convo = await Conversation.create({
  providerId,
  customerId,
  serviceId: null, // CRM conversations do NOT use listings

  lastMessageAt: now,
  lastMessageText: "Conversation started",
  lastMessageSenderRole: "provider",

  providerLastReadAt: now,
  customerLastReadAt: null,
});

    }

    return res.json({ success: true, conversation: convo });
  } catch (err) {
    console.log("❌ getOrCreateConversationWithCustomer:", err);
    return sendError(res, 500, "Server error.");
  }
};




/* =========================================================
   LIST MY CONVERSATIONS
   ========================================================= */
export const listMyConversations = async (req, res) => {
  try {
    console.log("🧠 AUTH CONTEXT:", req.user);
    
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);
    const includeArchived = req.query.includeArchived === "true";

    const or = [];

    // If user can be a provider, include provider-side conversations
    if (req.user?.providerId) {
      const providerBranch = { providerId: req.user.providerId };
      if (!includeArchived) providerBranch.providerArchivedAt = null;
      or.push(providerBranch);
    }

    // Always include customer-side conversations (if logged in)
    if (req.user?._id) {
      const customerBranch = { customerId: req.user._id };
      if (!includeArchived) customerBranch.customerArchivedAt = null;
      or.push(customerBranch);
    }

    if (or.length === 0) {
      return sendError(res, 401, "Unauthorized.");
    }

   const conversations = await Conversation.find({ $or: or })
  .populate("customerId", "name avatar phone")
 .populate("providerId", "name businessName avatar")
  .populate("serviceId", "title photos businessName")


      .sort({ lastMessageAt: -1, updatedAt: -1, createdAt: -1 })
      .limit(limit)
      .lean();

   const mapped = conversations.map((c) => {
  // Determine viewer role
  const isProviderView =
    !!req.user?.providerId &&
    String(c.providerId?._id || c.providerId) === String(req.user.providerId);

  const last = c.lastMessageAt ? new Date(c.lastMessageAt).getTime() : 0;

  const read = isProviderView
    ? c.providerLastReadAt
      ? new Date(c.providerLastReadAt).getTime()
      : 0
    : c.customerLastReadAt
    ? new Date(c.customerLastReadAt).getTime()
    : 0;

  const unread =
    last > read &&
    c.lastMessageSenderRole === (isProviderView ? "customer" : "provider");

  // ⭐ FINAL BUSINESS NAME RESOLUTION
const businessName =
  c.serviceId?.businessName ||
  c.providerId?.businessName ||
  "Customer";


  return {
    _id: c._id,

    // Required IDs
    providerId: c.providerId?._id || c.providerId,
    customerId: c.customerId?._id || c.customerId,
    serviceId: c.serviceId?._id || null,

    // Service info
    serviceTitle: c.serviceId?.title || null,
    serviceThumbnail: c.serviceId?.photos?.[0] || null,

    // ⭐ Display name used by Messages screen
    businessName,

    // Customer snapshot
    customer: c.customerId
      ? {
          name: c.customerId.name,
          avatar: c.customerId.avatar,
          phone: c.customerId.phone,
        }
      : null,

    // Provider snapshot
   provider: c.providerId
  ? {
      name: c.providerId.name,
      businessName: c.providerId.businessName,
      avatar: c.providerId.avatar,
    }
  : null,


    lastMessageText: c.lastMessageText || "",
    unread,
    updatedAt: c.updatedAt,
  };
});

// ✅ RESPONSE MUST BE OUTSIDE map()
return res.json({ success: true, conversations: mapped });

  } catch (err) {
    console.log("❌ listMyConversations:", err);
    return sendError(res, 500, "Server error.");
  }
};

/* =========================================================
   CONVERSATION META
   ========================================================= */
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

/* =========================================================
   GET CONVERSATION BY ID
   ========================================================= */
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

/* =========================================================
   MARK CONVERSATION READ
   ========================================================= */
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
        conversationId,
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
