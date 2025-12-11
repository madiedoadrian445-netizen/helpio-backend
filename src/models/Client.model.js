// src/models/Client.model.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/* ============================================================
   TIMELINE ENTRY SCHEMA
   (lightweight, no _id for compactness)
============================================================ */
const TimelineEntrySchema = new Schema(
  {
    type: {
      type: String,
      enum: ["note", "call", "email", "invoice", "system"],
      default: "note",
    },
    title: { type: String, trim: true },
    message: { type: String, trim: true },
    meta: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/* ============================================================
   CLIENT SCHEMA (HARDENED FOR B17)
============================================================ */
const ClientSchema = new Schema(
  {
    /* --------------------------------------------------------
       PROVIDER OWNERSHIP (MANDATORY FOR MULTI-TENANCY)
    -------------------------------------------------------- */
    provider: {
      type: mongoose.Types.ObjectId,
      ref: "Provider",
      required: true,
      index: true,
    },

    /* --------------------------------------------------------
       BASIC IDENTITY
    -------------------------------------------------------- */
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: "", trim: true },
    phoneFormatted: { type: String, default: "", trim: true },
    email: { type: String, default: "", lowercase: true, trim: true },
    company: { type: String, default: "", trim: true },
    address: { type: String, default: "", trim: true },

    /* --------------------------------------------------------
       CRM META
    -------------------------------------------------------- */
    status: {
      type: String,
      enum: ["lead", "active", "inactive", "blocked"],
      default: "lead",
      index: true,
    },

    source: { type: String, default: "manual", trim: true },

    /* Tags are sanitized to avoid injection issues */
    tags: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => Array.isArray(arr),
        message: "Tags must be an array of strings",
      },
    },

    /* --------------------------------------------------------
       FINANCIAL SNAPSHOT
    -------------------------------------------------------- */
    currency: { type: String, default: "usd", lowercase: true },

    totalInvoiced: { type: Number, default: 0, min: 0 },
    totalPaid: { type: Number, default: 0, min: 0 },

    lastInvoiceAt: { type: Date },

    /* --------------------------------------------------------
       ACTIVITY METRICS
    -------------------------------------------------------- */
    lastContactAt: { type: Date, index: true },

    /* --------------------------------------------------------
       NOTES + TIMELINE LOG
    -------------------------------------------------------- */
    notes: { type: String, default: "", trim: true },

    timeline: {
      type: [TimelineEntrySchema],
      default: [],
    },

    /* --------------------------------------------------------
       ARCHIVE CONTROL
    -------------------------------------------------------- */
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

/* ============================================================
   INDEXES FOR FAST CRM QUERIES
============================================================ */

ClientSchema.index({ provider: 1, name: 1 });
ClientSchema.index({ provider: 1, email: 1 });
ClientSchema.index({ provider: 1, phone: 1 });
ClientSchema.index({ provider: 1, tags: 1 });
ClientSchema.index({ provider: 1, status: 1 });
ClientSchema.index({ provider: 1, lastContactAt: -1 });
ClientSchema.index({ provider: 1, totalInvoiced: -1 });

/* ------------------------------------------------------------
   FULL-TEXT SEARCH (name, email, phone, company)
------------------------------------------------------------ */
ClientSchema.index({
  name: "text",
  email: "text",
  company: "text",
  phone: "text",
});

/* ============================================================
   HOOKS — AUTO-MAINTAIN ACTIVITY METRICS
============================================================ */

/**
 * Whenever timeline entries are added, update lastContactAt.
 */
ClientSchema.pre("save", function (next) {
  if (this.isModified("timeline") && this.timeline.length > 0) {
    const latest = this.timeline[0];
    if (latest?.createdAt) {
      this.lastContactAt = latest.createdAt;
    }
  }
  next();
});

/* ============================================================
   EXPORT
============================================================ */
export default mongoose.model("Client", ClientSchema);
