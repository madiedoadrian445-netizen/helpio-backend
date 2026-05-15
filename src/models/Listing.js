// src/models/Listing.js
import mongoose from "mongoose";

const listingSchema = new mongoose.Schema(
  {
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Provider",
      required: [true, "Provider is required"],
      index: true,
    },

    /* -----------------------------------------------------
       BUSINESS NAME
    ------------------------------------------------------ */
    businessName: {
      type: String,
      required: [true, "Business name is required"],
      trim: true,
      minlength: [2, "Business name must be at least 2 characters"],
      maxlength: [120, "Business name cannot exceed 120 characters"],
    },

    /* -----------------------------------------------------
       TITLE
    ------------------------------------------------------ */
    title: {
      type: String,
      required: [true, "Listing title is required"],
      trim: true,
      minlength: [3, "Title must be at least 3 characters"],
      maxlength: [120, "Title cannot exceed 120 characters"],
    },

    /* -----------------------------------------------------
       DESCRIPTION
    ------------------------------------------------------ */
    description: {
      type: String,
      required: [true, "Listing description is required"],
      minlength: [0, "Description cannot be empty"],
      maxlength: [3000, "Description cannot exceed 3000 characters"],
    },

    /* -----------------------------------------------------
       PRICE
    ------------------------------------------------------ */
    price: {
      type: Number,
      required: [true, "Listing price is required"],
      min: [0, "Price cannot be negative"],
      validate: {
        validator: (v) => typeof v === "number" && !Number.isNaN(v),
        message: "Price must be a valid number",
      },
    },

    /* -----------------------------------------------------
       CATEGORY
    ------------------------------------------------------ */
    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
      minlength: [1, "Category must be at least 1 character"],
      maxlength: [60, "Category cannot exceed 60 characters"],
      index: true,
    },

    /* -----------------------------------------------------
       IMAGES
       FIX — max 25 images enforced at schema level
    ------------------------------------------------------ */
    images: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) =>
          Array.isArray(arr) &&
          arr.length <= 25 &&
          arr.every((url) => typeof url === "string"),
        message: "Images must be an array of strings (max 25)",
      },
    },

    /* -----------------------------------------------------
       REVIEWS / RATINGS
       FIX #37 — ratingBreakdown uses explicit schema instead
       of Object type so Mongoose tracks mutations correctly
    ------------------------------------------------------ */
    rating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    ratingSum: { type: Number, default: 0 },

    ratingBreakdown: {
      one:   { type: Number, default: 0 },
      two:   { type: Number, default: 0 },
      three: { type: Number, default: 0 },
      four:  { type: Number, default: 0 },
      five:  { type: Number, default: 0 },
    },

    /* -----------------------------------------------------
       LOCATION (Geo-ready)
       FIX #32 — 2dsphere index moved to schema level below.
       Inline index: "2dsphere" on nested fields does not
       reliably register in Mongoose.
    ------------------------------------------------------ */
    location: {
      city:  { type: String, required: true },
      state: { type: String, required: true },
      zip:   { type: String },

      coordinates: {
        type: {
          type: String,
          enum: ["Point"],
          default: "Point",
        },
        coordinates: {
          type: [Number], // [lng, lat]
          required: true,
        },
      },
    },

    /* -----------------------------------------------------
       SYSTEM FIELDS
    ------------------------------------------------------ */
    isActive:  { type: Boolean, default: true },
    views:     { type: Number, default: 0, min: 0 },
    favorites: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

/* ---------------------------------------------------------
   INDEXES
   FIX #32 — 2dsphere at schema level (inline was unreliable)
   FIX #33 — isActive + geo compound for feed query speed
   FIX #34 — provider + isActive for provider listing queries
   FIX #35 — createdAt for sort performance
   FIX #36 — text index REMOVED, conflicts with Atlas Search
---------------------------------------------------------- */
listingSchema.index({ "location.coordinates": "2dsphere" });
listingSchema.index({ isActive: 1, "location.coordinates": "2dsphere" });
listingSchema.index({ provider: 1, isActive: 1 });
listingSchema.index({ category: 1, isActive: 1, createdAt: -1 });
listingSchema.index({ createdAt: -1 });

export default mongoose.model("Listing", listingSchema);