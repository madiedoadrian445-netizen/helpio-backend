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
   BUSINESS NAME (Company / Provider Display Name)
------------------------------------------------------ */
businessName: {
  type: String,
  required: [true, "Business name is required"],
  trim: true,
  minlength: [2, "Business name must be at least 2 characters"],
  maxlength: [120, "Business name cannot exceed 120 characters"],
},



    /* -----------------------------------------------------
       TITLE (Required, trimmed, safe length)
    ------------------------------------------------------ */
    title: {
      type: String,
      required: [true, "Listing title is required"],
      trim: true,
      minlength: [3, "Title must be at least 3 characters"],
      maxlength: [120, "Title cannot exceed 120 characters"],
    },

    /* -----------------------------------------------------
       DESCRIPTION (Required, safe length)
    ------------------------------------------------------ */
    description: {
  type: String,
  required: [true, "Listing description is required"],
  minlength: [0, "Description cannot be empty"],
  maxlength: [3000, "Description cannot exceed 3000 characters"],
},

    /* -----------------------------------------------------
       PRICE (Required, must be a valid number)
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
       IMAGES — must be array of strings
    ------------------------------------------------------ */
    images: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) =>
          Array.isArray(arr) && arr.every((url) => typeof url === "string"),
        message: "Images must be an array of strings",
      },
    },

    /* -----------------------------------------------------
       LOCATION (Safe defaults)
    ------------------------------------------------------ */
   /* -----------------------------------------------------
   LOCATION (Geo-ready)
------------------------------------------------------ */
location: {
  city: { type: String, required: true },
  state: { type: String, required: true },
  zip: { type: String },

  coordinates: {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point",
    },
    coordinates: {
      type: [Number], // [lng, lat]
      required: true,
      index: "2dsphere",
    },
  },
},

    /* -----------------------------------------------------
       SYSTEM FIELDS
    ------------------------------------------------------ */
    isActive: {
      type: Boolean,
      default: true,
    },

    views: {
      type: Number,
      default: 0,
      min: 0,
    },

    favorites: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

/* ---------------------------------------------------------
   INDEXES (Feed speed boost + search readiness)
---------------------------------------------------------- */
listingSchema.index({ category: 1, createdAt: -1 });
listingSchema.index({ title: "text", description: "text" });

export const Listing = mongoose.model("Listing", listingSchema);
