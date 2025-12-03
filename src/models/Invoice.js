// models/Invoice.js
const mongoose = require("mongoose");

const invoiceItemSchema = new mongoose.Schema(
  {
    description: { type: String, default: "" },   // 🔥 not required (fix)
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
      ref: "Provider",          // 🔥 correct model
      required: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },

    // Meta
    invoiceNumber: { type: String }, // optional, frontend sends string
    status: {
      type: String,
      enum: ["DUE", "PAID", "PARTIAL", "VOID"],
      default: "DUE",
    },
    issueDate: { type: String },
    dueDate: { type: String },

    items: [invoiceItemSchema],

    // Money
    subtotal: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    taxPct: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    currency: { type: String, default: "USD" },

    // Notes
    notes: { type: String, default: "" },  // 🔥 now included

    // Optional: PDF hosting later
    pdfUrl: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Invoice", invoiceSchema);
