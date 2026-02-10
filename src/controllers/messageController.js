import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import { getIO } from "../socket.js";




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
    senderId:
      req.user.customerId || req.user._id,
  };
};



/**
 * POST /api/messages/:conversationId/read
 * Marks messages as read for the current user
 */
export const markMessagesRead = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const convo = await Conversation.findById(conversationId);
    if (!convo) return sendError(res, 404, "Conversation not found.");

    const sender = getSenderContext(req);
    if (!sender) return sendError(res, 403, "Access denied.");

    const now = new Date();

    // 🔥 CRITICAL: mark unread messages as read
    await Message.updateMany(
  {
    conversationId,

    // only messages from the OTHER participant
    senderRole: { $ne: sender.role },

    readAt: null,
  },
  {
    $set: { readAt: now },
  }
);

// 🔥 REALTIME READ RECEIPT EMIT
try {
  const io = getIO();

  io.to(String(conversationId)).emit("messagesRead", {
    conversationId,
    readerId: sender.senderId,
    readAt: now,
  });
} catch (err) {
  console.log("Socket read emit failed:", err.message);
}



    return res.json({ success: true });
  } catch (err) {
    console.log("❌ markMessagesRead:", err);
    return sendError(res, 500, "Server error.");
  }
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

const resolveProviderId = async (req) => {
  if (req.user?.providerId) return req.user.providerId;

  // CRM user → provider lookup
  if (req.user?._id) {
    const convo = await Conversation.findOne({
      customerId: req.user._id,
    }).select("providerId");

    return convo?.providerId || null;
  }

  return null;
};


/**
 * POST /api/messages/:conversationId
 */
export const sendMessage = async (req, res) => {
  try {
    console.log("📨 SEND MESSAGE HIT");
    console.log("🧾 params:", req.params);
    console.log("🧾 body:", req.body);
    console.log("🧾 req.user:", {
      _id: req.user?._id,
      providerId: req.user?.providerId,
      hasProvider: !!req.user?.providerId,
    });

    const { conversationId } = req.params;

    console.log("🔍 Looking up conversation:", conversationId);
    let convo = await Conversation.findById(conversationId);
    console.log("🧠 convo exists:", !!convo);

    // 🧠 CRM FALLBACK — create conversation on send
if (!convo && req.body?.recipientId) {
  console.log("🧠 CRM fallback triggered");
  console.log("🧠 recipientId:", req.body.recipientId);

  const providerId =
    req.body.providerId || (await resolveProviderId(req));

  console.log("🧠 resolved providerId:", providerId);

  if (!providerId) {
    console.log("❌ CRM providerId unresolved");
    return sendError(res, 403, "Provider context missing.");
  }

  convo = await Conversation.create({
    providerId,
    customerId: req.body.recipientId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log("✅ CRM conversation created:", convo._id);
}


    if (!convo) {
      console.log("❌ NO CONVERSATION AFTER FALLBACK");
      return sendError(res, 404, "Conversation not found.");
    }

    // leave the rest of your logic unchanged


// Still not found → real error
if (!convo) {
  return sendError(res, 404, "Conversation not found.");
}


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
  conversationId: convo._id,   // ✅ FIXED
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

/* 🔴 REAL-TIME EMIT — sends message instantly to both users */
try {
  const io = getIO();
  io.to(String(convo._id)).emit("newMessage", msg);
} catch (err) {
  console.log("Socket emit failed:", err.message);
}

return res.status(201).json({
  success: true,
  message: msg,
});

  } catch (err) {
    console.log("❌ sendMessage:", err);
    return sendError(res, 500, "Server error.");
  }
};
