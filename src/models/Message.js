import mongoose from "mongoose";

const { Schema } = mongoose;

const MessageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
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

    senderRole: {
      type: String,
      enum: ["provider", "customer"],
      required: true,
      index: true,
    },
    senderId: { type: Schema.Types.ObjectId, required: true },

    type: { type: String, enum: ["text", "image"], default: "text" },
    text: { type: String, trim: true, maxlength: 4000, default: "" },

    // for image messages (URLs only — persistent)
    imageUrls: { type: [String], default: [] },

    // iMessage states
    deliveredAt: { type: Date, default: null },
    readAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

// paging
MessageSchema.index({ conversationId: 1, createdAt: -1 });
// useful for unread stamping
MessageSchema.index({ conversationId: 1, senderRole: 1, readAt: 1, createdAt: -1 });

export default mongoose.model("Message", MessageSchema);
