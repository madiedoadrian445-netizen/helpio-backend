import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Listing from "../models/Listing.js";
import ProviderDailyStat from "../models/ProviderDailyStat.js";
import mongoose from "mongoose";


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

      // 🔎 DEBUG LOGS — ADD THESE
    console.log("========== CONVERSATION DEBUG ==========");
    console.log("REQ PARAMS:", req.params);
    console.log("REQ BODY:", req.body);
    console.log("serviceId type:", typeof req.body?.serviceId);
    console.log("providerId param:", req.params?.providerId);
    console.log("req.user:", req.user);
    console.log("========================================");

   let providerId =
  req.params.providerId ||
  req.user?.providerId ||
  null;

// 🔥 Always normalize to string before validation
if (providerId && typeof providerId !== "string") {
  providerId = String(providerId);
}


 // ⭐ Determine customer correctly

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


    const { serviceId } = req.body;

    // 🚨 If no serviceId AND no providerId → cannot create CRM convo
// After SERVICE block ends

// 🚨 For CRM conversations we MUST have providerId
if (!serviceId && !providerId) {
  return sendError(res, 400, "Provider ID is required.");
}



  /* ===============================
   SERVICE-BASED CONVERSATION
   =============================== */
if (serviceId) {

// 🛡 Prevent Mongo CastError crash
if (!mongoose.Types.ObjectId.isValid(serviceId)) {
  return sendError(res, 400, "Invalid service ID.");
}

  
  const listing = await Listing.findById(serviceId)
    .select("_id isActive businessName title images provider")
    .lean();

  console.log("🧪 LISTING FOUND:", listing);


  
  // 1️⃣ Listing must exist
  if (!listing) {
    return sendError(res, 404, "Listing not found.");
  }

  // 2️⃣ Listing must be active
  if (listing.isActive === false) {
    return sendError(res, 404, "Messaging is only available for live listings.");
  }

  // 3️⃣ Resolve providerId from listing if customer started convo
  if (!providerId && listing.provider) {
    providerId = listing.provider;
  }

  // 🛡 Prevent Mongo CastError → 500 crash
if (!mongoose.Types.ObjectId.isValid(customerId)) {
  return sendError(res, 400, "Invalid customer.");
}

if (!providerId || !mongoose.Types.ObjectId.isValid(providerId)) {
  console.log("❌ providerId invalid:", providerId);
  return sendError(res, 400, "Invalid provider.");
}



  console.log("🧪 providerId resolved:", providerId);
  console.log("🧪 customerId:", customerId);

  // 4️⃣ NOW check auth
  if (!providerId || !customerId) {
    return sendError(res, 401, "Unauthorized.");
  }

  // 5️⃣ Find existing convo
  let convo = await Conversation.findOne({
    providerId: new mongoose.Types.ObjectId(providerId),
    customerId: new mongoose.Types.ObjectId(customerId),
    serviceId: new mongoose.Types.ObjectId(serviceId),
  });

  const now = new Date();





let isNewConversation = false;

if (!convo) {
  convo = await Conversation.create({
    providerId: new mongoose.Types.ObjectId(providerId),
    customerId: new mongoose.Types.ObjectId(customerId),
    serviceId: new mongoose.Types.ObjectId(serviceId),
    businessName: listing?.businessName || null,

    // real message will set these
    providerLastReadAt: null,
    customerLastReadAt: null,
  });

  // Lead tracking only when CUSTOMER starts a NEW convo
  if (!req.user?.providerId) {
    await recordLeadIfNewConversation({ providerId });
  }
}


/* =========================================================
   ALWAYS CREATE MESSAGE IF TEXT EXISTS
   (new OR existing conversation)
   ========================================================= */


/* =========================================================
   CREATE FIRST MESSAGE IF TEXT PROVIDED
   ========================================================= */
// ✅ Conversation ready — message will be sent separately
/* =========================================================
   CREATE FIRST MESSAGE IF TEXT PROVIDED
   ========================================================= */

const { text } = req.body;

if (text && text.trim()) {
  const isProvider = !!req.user?.providerId;

 const message = await Message.create({
  conversationId: convo._id,

  senderId: new mongoose.Types.ObjectId(
    isProvider ? providerId : customerId
  ),

  providerId: new mongoose.Types.ObjectId(providerId),
  customerId: new mongoose.Types.ObjectId(customerId),

  senderRole: isProvider ? "provider" : "customer",
  text: text.trim(),
});

  // update conversation preview
  convo.lastMessageText = message.text;
  convo.lastMessageAt = new Date();
  convo.lastMessageSenderRole = message.senderRole;

  await convo.save();
}

return res.json({
  success: true,
  conversation: convo,
});

    }


    
 
/* ===============================
   CRM-BASED CONVERSATION (NO MESSAGE HERE)
   =============================== */

const crmQuery = {
  providerId: new mongoose.Types.ObjectId(providerId),
  customerId: new mongoose.Types.ObjectId(customerId),
  serviceId: null,
};

// find or create convo
let convo = await Conversation.findOne(crmQuery);

if (!convo) {
  convo = await Conversation.create({
    ...crmQuery,
    businessName: null,

    // real message will set these
    providerLastReadAt: null,
    customerLastReadAt: null,
  });

  // Lead tracking only when CUSTOMER starts (usually CRM is provider-started,
  // but keeping this logic safe)
  if (!req.user?.providerId) {
    await recordLeadIfNewConversation({ providerId });
  }
}

return res.json({ success: true, conversation: convo });


 } catch (err) {
  console.log("❌ getOrCreateConversationWithCustomer ERROR");
  console.log("message:", err?.message);
  console.log("name:", err?.name);
  console.log("errors:", err?.errors);
  console.log("stack:", err?.stack);

  // 🔥 Mongoose validation / cast errors → return real reason
  if (err?.name === "ValidationError" || err?.name === "CastError") {
    return sendError(res, 400, err.message);
  }

  // 🔥 Default
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
 .populate({
  path: "customerId",
  model: "User",
  select: "name avatar phone",
})

.populate({
  path: "providerId",
  select: "businessName avatar user",
  populate: {
    path: "user",
    select: "name"
  }
})

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

  // 🔥 Safe participant resolution
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

    // IDs
    providerId: c.providerId?._id || c.providerId,
    customerId: c.customerId?._id || c.customerId,
    serviceId: c.serviceId?._id || null,

    // Service info
    serviceTitle: c.serviceId?.title || null,
    serviceThumbnail: c.serviceId?.photos?.[0] || null,

    // Participants
    customer,
    provider,

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
