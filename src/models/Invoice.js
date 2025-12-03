// src/models/Invoice.js
import mongoose from "mongoose";

const invoiceItemSchema = new mongoose.Schema(
  {
    description: { type: String, default: "" },
    qty: { type: Number, default: 1 },
    rate: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Provider",
      required: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },

    invoiceNumber: { type: String },
    status: {
      type: String,
      enum: ["DUE", "PAID", "PARTIAL", "VOID"],
      default: "DUE",
    },
    issueDate: { type: String },
    dueDate: { type: String },

    items: [invoiceItemSchema],

    subtotal: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    taxPct: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    currency: { type: String, default: "USD" },

    notes: { type: String, default: "" },

    pdfUrl: { type: String },
  },
  { timestamps: true }
);

const Invoice = mongoose.model("Invoice", invoiceSchema);
export default Invoice;
