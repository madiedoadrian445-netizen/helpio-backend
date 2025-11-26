// src/models/Customer.js
import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Provider",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      trim: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
    },

    address: {
      type: String,
      trim: true,
    },

    notes: {
      type: String,
      trim: true,
    },

    tags: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

export const Customer = mongoose.model("Customer", customerSchema);
