// models/CustomerTimeline.js
import mongoose from "mongoose";

const customerTimelineSchema = new mongoose.Schema(
  {
    // Provider is optional — some timeline events (like system notes)
    // may not require linking to a provider.
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Provider",
      required: false,
    },

    // FIXED: Must reference the Client model
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },

    type: {
      type: String,
      enum: ["note", "job", "invoice", "payment", "message", "other"],
      default: "other",
    },

    title: {
      type: String,
      required: true,
    },

    description: {
      type: String,
    },

    amount: {
      type: Number,
    },

    // Optional link to invoice/payment/job IDs in the future
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      required: false,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt auto-generated
  }
);

// Index for fast timeline retrieval
customerTimelineSchema.index({ customer: 1, createdAt: -1 });

export const CustomerTimeline = mongoose.model(
  "CustomerTimeline",
  customerTimelineSchema
);
