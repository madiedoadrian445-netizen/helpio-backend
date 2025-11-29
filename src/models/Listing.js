// src/models/Listing.js
import mongoose from "mongoose";

const listingSchema = new mongoose.Schema(
  {
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Provider",
      required: true,
    },

    // Required core fields
    title: {
      type: String,
      required: [true, "Listing title is required"],
      trim: true,
    },

    description: {
      type: String,
      required: [true, "Listing description is required"],
    },

    price: {
      type: Number,
      required: [true, "Listing price is required"],
    },

    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
    },

    // Your app sends photos array → normalize to `images`
    images: {
      type: [String], // Cloudinary URLs later — local file URIs for now
      default: [],
    },

    // Location block — perfect for scaling later
    location: {
      city: { type: String, default: "Miami" },
      state: { type: String, default: "FL" },
      country: { type: String, default: "USA" },
    },

    // Engagement / stats
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
