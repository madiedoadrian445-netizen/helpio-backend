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
      ref: "Customer",
      required: true,
      index: true,
    },

    // fast list UI
    lastMessageAt: { type: Date, default: null, index: true },
    lastMessageText: { type: String, default: "" },
    lastMessageSenderRole: {
      type: String,
      enum: ["provider", "customer"],
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

// enforce 1:1 uniqueness
ConversationSchema.index({ providerId: 1, customerId: 1 }, { unique: true });

export default mongoose.model("Conversation", ConversationSchema);
