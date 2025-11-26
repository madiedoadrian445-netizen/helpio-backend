// src/models/Listing.js
import mongoose from "mongoose";

const listingSchema = new mongoose.Schema(
  {
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Provider",
      required: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
    },

    price: {
      type: Number,
      required: true,
    },

    category: {
      type: String,
      required: true,
      trim: true,
    },

    images: {
      type: [String], // array of Cloudinary URLs
      default: [],
    },

    location: {
      city: String,
      state: String,
      country: String,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    views: {
      type: Number,
      default: 0,
    },

    favorites: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export const Listing = mongoose.model("Listing", listingSchema);
