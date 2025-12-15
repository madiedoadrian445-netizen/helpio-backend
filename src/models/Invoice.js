// src/models/Invoice.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/* -------------------------------------------------------
   ITEM SUB-SCHEMA (UPDATED — SAFE & BACKWARD COMPATIBLE)
-------------------------------------------------------- */
const invoiceItemSchema = new Schema(
  {
    title: {
      type: String,
      default: "",
      trim: true,
      maxlength: [200, "Item title too long"],
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: [500, "Item description too long"],
    },
    qty: {
      type: Number,
      default: 1,
      min: [0, "Quantity cannot be negative"],
    },
    rate: {
      type: Number,
      default: 0,
      min: [0, "Rate cannot be negative"],
    },
    amount: {
      type: Number,
      default: 0,
      min: [0, "Amount cannot be negative"],
    },
  },
  { _id: false }
);

/* -------------------------------------------------------
   MAIN INVOICE SCHEMA
   ⚠️ 100% compatible with your existing frontend + backend
-------------------------------------------------------- */
const invoiceSchema = new Schema(
  {
    provider: {
      type: Schema.Types.ObjectId,
      ref: "Provider",
      required: true,
      index: true,
    },

/* ---------------------------------------------------
   CUSTOMER SNAPSHOT (CRITICAL)
   Stored at invoice creation time for immutability
---------------------------------------------------- */
customerSnapshot: {
  name: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  company: { type: String, trim: true },
  address: { type: String, trim: true },
},


    // FIXED: must reference Customer, not Client
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },

    invoiceNumber: {
      type: String,
      trim: true,
      maxlength: [120, "Invoice number too long"],
      index: true,
    },

    status: {
      type: String,
      enum: ["DUE", "PAID", "PARTIAL", "VOID", "DRAFT"],
      default: "DUE",
    },

    /* ---------------------------------------------------
       Dates (you store them as STRINGS — kept EXACTLY)
    ---------------------------------------------------- */
    issueDate: { type: String, trim: true },
    dueDate: { type: String, trim: true },

    /* ---------------------------------------------------
       Items (unchanged)
    ---------------------------------------------------- */
    items: {
      type: [invoiceItemSchema],
      default: [],
      validate: {
        validator: (arr) =>
          Array.isArray(arr) &&
          arr.every((i) => typeof i === "object" && i !== null),
        message: "Items must be a valid array",
      },
    },

    /* ---------------------------------------------------
       FINANCIAL FIELDS (normalized & safe)
    ---------------------------------------------------- */
    subtotal: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    taxPct: { type: Number, default: 0, min: 0 },
    total: { type: Number, default: 0, min: 0 },
    paid: { type: Number, default: 0, min: 0 },
    balance: { type: Number, default: 0, min: 0 },

    currency: {
      type: String,
      default: "USD",
      uppercase: true,
      trim: true,
      maxlength: 5,
    },

    notes: {
      type: String,
      default: "",
      trim: true,
      maxlength: [5000, "Notes too long"],
    },

    /* ---------------------------------------------------
       PDF Support
    ---------------------------------------------------- */
    pdfUrl: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

/* -------------------------------------------------------
   INDEXES
-------------------------------------------------------- */
invoiceSchema.index({ provider: 1, customer: 1, createdAt: -1 });
invoiceSchema.index({ invoiceNumber: 1 });

/* -------------------------------------------------------
   EXPORTS — FIXED: supports both named + default import
-------------------------------------------------------- */
export const Invoice = mongoose.model("Invoice", invoiceSchema);
export default Invoice;
