// src/models/Client.model.js
import mongoose from "mongoose";

const TimelineEntrySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["note", "call", "email", "invoice", "system"],
      default: "note",
    },
    title: {
      type: String,
      trim: true,
    },
    message: {
      type: String,
      trim: true,
    },
    meta: {
      type: Object,
      default: {},
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const ClientSchema = new mongoose.Schema(
  {
    // BASIC IDENTITY
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      default: "",
      trim: true,
    },
    phoneFormatted: {
      type: String,
      default: "",
      trim: true,
    },
    email: {
      type: String,
      default: "",
      lowercase: true,
      trim: true,
    },
    company: {
      type: String,
      default: "",
      trim: true,
    },
    address: {
      type: String,
      default: "",
      trim: true,
    },

    // CRM FIELDS
    status: {
      type: String,
      enum: ["lead", "active", "inactive", "blocked"],
      default: "lead",
    },
    source: {
      type: String,
      default: "manual", // manual / helpio / referral / instagram / etc
      trim: true,
    },
    tags: {
      type: [String],
      default: [],
    },

    // FINANCIAL SNAPSHOT
    currency: {
      type: String,
      default: "USD",
    },
    totalInvoiced: {
      type: Number,
      default: 0,
    },
    totalPaid: {
      type: Number,
      default: 0,
    },
    lastInvoiceAt: {
      type: Date,
    },

    // ACTIVITY
    lastContactAt: {
      type: Date,
    },

    // INTERNAL NOTES
    notes: {
      type: String,
      default: "",
      trim: true,
    },

    // TIMELINE ENTRIES (log of interactions)
    timeline: {
      type: [TimelineEntrySchema],
      default: [],
    },

    // ARCHIVE
    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Client", ClientSchema);
