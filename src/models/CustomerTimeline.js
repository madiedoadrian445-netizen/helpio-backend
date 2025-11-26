// src/models/CustomerTimeline.js
import mongoose from "mongoose";

const customerTimelineSchema = new mongoose.Schema(
  {
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Provider",
      required: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
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
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

// Optional index for faster queries
customerTimelineSchema.index({ provider: 1, customer: 1, createdAt: -1 });

export const CustomerTimeline = mongoose.model(
  "CustomerTimeline",
  customerTimelineSchema
);
