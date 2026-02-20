import mongoose from "mongoose";

const { Schema } = mongoose;

const ConversationSchema = new Schema(
  {
    providerId: {
      type: Schema.Types.ObjectId,
      ref: "Provider",
      required: true,
      index: true,
    },

    customerId: {
      type: Schema.Types.ObjectId,
     ref: "User",
      required: true,
      index: true,
    },

    // 🔥 REQUIRED — this was missing
    serviceId: {
  type: mongoose.Schema.Types.ObjectId,
 ref: "Listing",
  required: false, // 🔥 FIX
},


    // fast list UI
    lastMessageAt: { type: Date, default: null, index: true },
    lastMessageText: { type: String, default: "" },
    lastMessageSenderRole: {
      type: String,
      enum: ["provider", "customer", "system"],
      default: "provider",
    },

    // iMessage-style read tracking
    providerLastReadAt: { type: Date, default: null },
    customerLastReadAt: { type: Date, default: null },

    // optional: archive per side (future)
    providerArchivedAt: { type: Date, default: null },
    customerArchivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// ✅ one conversation PER listing
ConversationSchema.index(
  { providerId: 1, customerId: 1, serviceId: 1 },
  { unique: true }
);

export default mongoose.model("Conversation", ConversationSchema);
