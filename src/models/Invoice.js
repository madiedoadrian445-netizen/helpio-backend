import mongoose from "mongoose";

const invoiceSchema = new mongoose.Schema(
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
    items: [
      {
        description: String,
        quantity: Number,
        rate: Number,
        amount: Number,
      }
    ],
    subtotal: Number,
    tax: Number,
    total: Number,
    notes: String,
  },
  { timestamps: true }
);

export const Invoice = mongoose.model("Invoice", invoiceSchema);
