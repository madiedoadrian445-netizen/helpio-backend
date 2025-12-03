import mongoose from "mongoose";

/* -------------------------------------------------------------
   ⭐ TIMELINE EVENT SCHEMA
   - Supports invoices, notes, payments, calls, reminders, etc
--------------------------------------------------------------*/
const TimelineEventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["note", "call", "invoice", "payment", "reminder"],
      default: "note",
    },

    label: { type: String }, // e.g. "Invoice created"

    // When event is an invoice
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
    },

    amount: { type: Number }, // invoice amount, payment amount, etc
    status: { type: String }, // "PAID", "DUE", etc

    meta: { type: mongoose.Schema.Types.Mixed }, // flexible extra data

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

/* -------------------------------------------------------------
   ⭐ CLIENT SCHEMA — FULL CRM VERSION
--------------------------------------------------------------*/
const ClientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String },
    phoneFormatted: { type: String },
    email: { type: String },
    company: { type: String },
    address: { type: String },
    notes: { type: String },

    /* --------------------------------------------
       ⭐ NEW: STORE ALL INVOICES FOR THIS CLIENT
    ---------------------------------------------*/
    invoices: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Invoice",
      },
    ],

    /* --------------------------------------------
       ⭐ NEW: TIMELINE EVENTS (chronological CRM history)
    ---------------------------------------------*/
    timeline: [TimelineEventSchema],
  },
  { timestamps: true }
);

export default mongoose.model("Client", ClientSchema);
