// src/models/Provider.js
import mongoose from "mongoose";

const providerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    businessName: {
      type: String,
      required: true,
      trim: true,
    },

    phone: String,
    email: String,

    address: String,
    city: String,
    state: String,
    country: String,

    // Business profile fields
    description: String,
    category: String, // "Automotive", "Marine", "Home Services", etc.

    logoUrl: String,
    coverImageUrl: String,

    gallery: [String],

    isVerified: {
      type: Boolean,
      default: false,
    },

    rating: {
      type: Number,
      default: 0,
    },

    completedJobs: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

export const Provider = mongoose.model("Provider", providerSchema);
