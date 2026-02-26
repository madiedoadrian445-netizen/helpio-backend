
// src/controllers/conversationController.js
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Listing from "../models/Listing.js";
import ProviderDailyStat from "../models/ProviderDailyStat.js";
import mongoose from "mongoose";

const toObjectId = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    const e = new Error(`Invalid ObjectId: ${id}`);
    e.name = "CastError";
    throw e;
  }
  return id instanceof mongoose.Types.ObjectId
    ? id
    : new mongoose.Types.ObjectId(id);
};

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

const yyyyMmDd = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const recordLeadIfNewConversation = async ({ providerId }) => {
  if (!providerId) return;

  const day = yyyyMmDd();
  const cooldownUntil = new Date(Date.now() + 45 * 60 * 1000); // 45 minutes

  await ProviderDailyStat.updateOne(
    { providerId, day },
    {
      $inc: { leads: 1 },
      $set: { cooldown_until: cooldownUntil },
    },
    { upsert: true }
  );
};

/* =========================================================
   CREATE OR FETCH CONVERSATION
   ========================================================= */
export const getOrCreateConversationWithCustomer = async (req, res) => {
  try {
    // 🔎 DEBUG LOGS — KEEP IF YOU WANT
    console.log("========== CONVERSATION DEBUG ==========");
    console.log("REQ PARAMS:", req.params);
    console.log("REQ BODY:", req.body);
    console.log("serviceId type:", typeof req.body?.serviceId);
    console.log("providerId param:", req.params?.providerId);
    console.log("req.user:", req.user);
    console.log("========================================");

    let providerId = req.params.providerId || req.user?.providerId || null;

    // normalize providerId
    if (providerId && typeof providerId !== "string") providerId = String(providerId);

    // CUSTOMER resolution (robust)
    let customerId =
      req.user?._id ||
      req.params.customerId ||
      req.body.customerId ||
      null;

    if (!customerId) {
      console.log("❌ customerId missing at conversation start");
      return sendError(res, 401, "Unauthorized.");
    }

    // normalize customerId (CRITICAL)
    if (customerId && typeof customerId !== "string") customerId = String(customerId);

    const { serviceId } = req.body;

    // 🚨 For CRM conversations we MUST have providerId
    if (!serviceId && !providerId) {
      return sendError(res, 400, "Provider ID is required.");
    }

    // We'll set this exactly once and reuse it for message sending + response
   let convo = null;

/* ===============================
   SERVICE-BASED CONVERSATION
   =============================== */
if (serviceId) {

  if (!mongoose.Types.ObjectId.isValid(serviceId)) {
    return sendError(res, 400, "Invalid service ID.");
  }

  const listing = await Listing.findById(serviceId)
    .select("_id isActive businessName title images provider")
    .lean();

  if (!listing) {
    return sendError(res, 404, "Listing not found.");
  }

  if (!listing.provider) {
    return sendError(res, 400, "Listing has no provider attached.");
  }

  if (listing.isActive === false) {
    return sendError(res, 404, "Messaging is only available for live listings.");
  }

  if (!providerId) {
    providerId = String(listing.provider);
  }

  if (!mongoose.Types.ObjectId.isValid(customerId)) {
    return sendError(res, 400, "Invalid customer.");
  }

  if (!providerId || !mongoose.Types.ObjectId.isValid(providerId)) {
    return sendError(res, 400, "Invalid provider.");
  }

  convo = await Conversation.findOneAndUpdate(
    {
      providerId: toObjectId(providerId),
      customerId: toObjectId(customerId),
      serviceId: toObjectId(serviceId),
    },
    {
      $setOnInsert: {
        providerLastReadAt: null,
        customerLastReadAt: null,
        createdAt: new Date(),
      },
    },
    {
      new: true,
      upsert: true,
    }
  );

} else {

  /* ===============================
     CRM-BASED CONVERSATION
     =============================== */

  if (!mongoose.Types.ObjectId.isValid(customerId)) {
    return sendError(res, 400, "Invalid customer.");
  }

  if (!providerId || !mongoose.Types.ObjectId.isValid(providerId)) {
    return sendError(res, 400, "Invalid provider.");
  }

  convo = await Conversation.findOneAndUpdate(
    {
      providerId: toObjectId(providerId),
      customerId: toObjectId(customerId),
      serviceId: null,
    },
    {
      $setOnInsert: {
        providerLastReadAt: null,
        customerLastReadAt: null,
        createdAt: new Date(),
      },
    },
    {
      new: true,
      upsert: true,
    }
  );
}
      // Lead tracking only if CUSTOMER started and convo was new
      // (Mongoose doesn't return rawResult here; if you want exact insert detection,
      // switch CRM to rawResult too. Keeping your original intent safe.)
  

    /* ===============================
       CREATE MESSAGE IF TEXT EXISTS
       =============================== */
    const { text } = req.body;

    if (text && text.trim()) {
      const isProvider = !!req.user?.providerId;

console.log("====== MESSAGE DEBUG ======");
  console.log("convo._id:", convo?._id);
  console.log("providerId:", providerId);
  console.log("customerId:", customerId);
  console.log("senderRole:", isProvider ? "provider" : "customer");
  console.log("===========================");



      const senderProviderId = req.user?.providerId ? String(req.user.providerId) : null;

const message = await Message.create({
  conversationId: convo._id,

  // senderId must be the SENDER's identity, not convo.providerId (recipient)
  senderId: toObjectId(isProvider ? senderProviderId : customerId),

  providerId: toObjectId(providerId),    // ✅ convo recipient provider
  customerId: toObjectId(customerId),    // ✅ convo customer (user._id)
  senderRole: isProvider ? "provider" : "customer",
  text: text.trim(),
});
const createdAt = message.createdAt;

// 🔥 Determine which side of THIS conversation the sender belongs to
const senderIsProviderSide =
  req.user?.providerId &&
  String(convo.providerId?._id || convo.providerId) ===
  String(req.user.providerId?._id || req.user.providerId);

if (senderIsProviderSide) {
  convo.providerLastReadAt = createdAt;
} else {
  convo.customerLastReadAt = createdAt;
}

convo.lastMessageSenderId = message.senderId;

// update conversation preview
convo.lastMessageText = message.text;
convo.lastMessageAt = createdAt;
convo.lastMessageSenderRole = message.senderRole;

      await convo.save();
    }

    return res.json({
      success: true,
      conversation: convo,
    });
  } catch (err) {
    console.log("❌ getOrCreateConversationWithCustomer ERROR");
    console.log("message:", err?.message);
    console.log("name:", err?.name);
    console.log("errors:", err?.errors);
    console.log("stack:", err?.stack);

// Duplicate conversation (unique index hit)
if (err?.code === 11000) {
  return sendError(res, 409, "Conversation already exists.");
}

    // Mongoose validation / cast errors → return real reason
    if (err?.name === "ValidationError" || err?.name === "CastError") {
      return sendError(res, 400, err.message);
    }

    return sendError(res, 500, "Server error.");
  }
};

/* =========================================================
   LIST MY CONVERSATIONS
   ========================================================= */
export const listMyConversations = async (req, res) => {
  try {
    console.log("========== AUTH DEBUG ==========");
    console.log("req.user:", req.user);
    console.log("req.user?._id:", req.user?._id);
    console.log("req.user?.providerId:", req.user?.providerId);
    console.log("================================");

    const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);
    const includeArchived = req.query.includeArchived === "true";

    const or = [];

    // Provider-side conversations
    if (req.user?.providerId) {
      const providerBranch = { providerId: req.user.providerId };
      if (!includeArchived) providerBranch.providerArchivedAt = null;
      or.push(providerBranch);
    }

    // Customer-side conversations
    if (req.user?._id) {
      const customerBranch = { customerId: req.user._id };
      if (!includeArchived) customerBranch.customerArchivedAt = null;
      or.push(customerBranch);
    }

    if (or.length === 0) {
      return sendError(res, 401, "Unauthorized.");
    }

    const conversations = await Conversation.find({ $or: or })
      .populate({
        path: "customerId",
        model: "User",
        select: "name avatar phone",
      })
      .populate({
        path: "providerId",
        select: "businessName avatar user phone",
        populate: {
          path: "user",
          select: "name",
        },
      })
      .populate("serviceId", "title photos businessName")
      .sort({ lastMessageAt: -1, updatedAt: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    const mapped = conversations.map((c) => {
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
const lastSenderId = c.lastMessageSenderId
  ? String(c.lastMessageSenderId?._id || c.lastMessageSenderId)
  : null;

// Determine which side of THIS conversation the viewer is on
// All possible IDs that belong to THIS logged-in user
const myIds = [
  req.user?._id ? String(req.user._id) : null,
  req.user?.providerId ? String(req.user.providerId) : null,
].filter(Boolean);

// Determine if last message was sent by me
const mine = myIds.includes(lastSenderId);

// unread if newer than readAt AND last message is not mine
const unread = !!last && last > read && !mine;
      let customer = null;
      let provider = null;

      if (c.customerId) {
        customer = {
          _id: c.customerId._id,
          name: c.customerId.name || "Customer",
          avatar: c.customerId.avatar || null,
          phone: c.customerId.phone || null,
        };
      }

      if (c.providerId) {
        provider = {
          _id: c.providerId._id,
          name: c.providerId.user?.name || "Provider",
          businessName:
            c.providerId.businessName ||
            c.serviceId?.businessName ||
            "Business",
          avatar: c.providerId.avatar || null,
          phone: c.providerId.phone || null,
        };
      }

      return {
        _id: c._id,

        providerId: c.providerId?._id || c.providerId,
        customerId: c.customerId?._id || c.customerId,
        serviceId: c.serviceId?._id || null,

        serviceTitle: c.serviceId?.title || null,
        serviceThumbnail: c.serviceId?.photos?.[0] || null,

        customer,
        provider,

        lastMessageText: c.lastMessageText || "",
        unread,
        updatedAt: c.updatedAt,
      };
    });

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

  const viewerIsProviderSide =
  req.user?.providerId &&
  String(convo.providerId?._id || convo.providerId) ===
  String(req.user.providerId?._id || req.user.providerId);

if (viewerIsProviderSide) {
  // I'm the provider side of THIS conversation
  convo.providerLastReadAt = now;
} else {
  // I'm the customer side (could be real customer OR provider acting as customer)
  convo.customerLastReadAt = now;
}

await convo.save();

// mark messages as read where sender is NOT me
const mySenderIds = [
  req.user?.providerId ? String(req.user.providerId) : null,
  req.user?._id ? String(req.user._id) : null,
].filter(Boolean);

await Message.updateMany(
  {
    conversationId,
    senderId: { $nin: mySenderIds },
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