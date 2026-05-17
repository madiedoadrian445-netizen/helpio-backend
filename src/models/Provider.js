// src/models/Provider.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/* -------------------------------------------------------
   SOCIAL LINKS SUB-SCHEMA
-------------------------------------------------------- */
const socialsSchema = new Schema(
  {
    instagram: { type: String, trim: true, maxlength: 200 },
    facebook:  { type: String, trim: true, maxlength: 200 },
    tiktok:    { type: String, trim: true, maxlength: 200 },
    youtube:   { type: String, trim: true, maxlength: 200 },
    twitter:   { type: String, trim: true, maxlength: 200 },
    linkedin:  { type: String, trim: true, maxlength: 200 },
  },
  { _id: false }
);

/* -------------------------------------------------------
   MAIN PROVIDER SCHEMA
-------------------------------------------------------- */
const providerSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required for provider"],
      unique: true,
      index: true,
    },

    businessName: {
      type: String,
      required: [true, "Business name is required"],
      trim: true,
      minlength: [2, "Business name must be at least 2 characters"],
      maxlength: [100, "Business name cannot exceed 100 characters"],
    },

    // NEW — short headline shown under business name on profile
    tagline: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },

    phone: {
      type: String,
      trim: true,
      maxlength: [20, "Phone number seems too long"],
      validate: {
        validator: function (v) {
          if (!v) return true;
          return v.length >= 7;
        },
        message: "Phone number seems too short",
      },
      default: "",
    },

    email: {
      type: String,
      required: [true, "Business email is required"],
      trim: true,
      lowercase: true,
      maxlength: [160, "Email cannot exceed 160 characters"],
      validate: {
        validator: (v) =>
          /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@(([^<>()[\]\.,;:\s@"]+\.)+[^<>()[\]\.,;:\s@"]{2,})$/i.test(
            v || ""
          ),
        message: "Invalid email format",
      },
    },

    address:  { type: String, trim: true, maxlength: 200 },
    city:     { type: String, trim: true, default: "Miami", maxlength: 100 },
    state:    { type: String, trim: true, default: "FL", maxlength: 100 },
    zip:      { type: String, trim: true, maxlength: 20 },
    country:  { type: String, trim: true, default: "USA", maxlength: 100 },

    // Single primary category (legacy — kept for feed filtering)
    category: { type: String, trim: true, maxlength: 100 },

    // NEW — multi-select service categories for provider profile display
    categories: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) =>
          Array.isArray(arr) &&
          arr.length <= 20 &&
          arr.every((c) => typeof c === "string" && c.length <= 60),
        message: "Categories must be an array of up to 20 short labels",
      },
    },

    description: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: "",
    },

    services: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) =>
          Array.isArray(arr) &&
          arr.length <= 100 &&
          arr.every((s) => typeof s === "string" && s.length <= 120),
        message: "Services must be an array of short text labels",
      },
    },

    website: { type: String, trim: true, maxlength: 200 },
    socials:  { type: socialsSchema, default: () => ({}) },

    /* FIX #40 — geoLocation converted to proper GeoJSON Point */
    geoLocation: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [lng, lat]
        default: undefined,
      },
    },

    /* FIX #41 — logoUrl is the avatar, coverImageUrl is the banner */
    logoUrl:       { type: String, trim: true, maxlength: 500 },
    coverImageUrl: { type: String, trim: true, maxlength: 500 },

    gallery: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length <= 50,
        message: "Too many gallery images",
      },
    },

    isPublic:    { type: Boolean, default: true,  index: true },
    isVerified:  { type: Boolean, default: false, index: true },

    /* FIX #38 — isChoice for "Helpio's Choice" feed tab */
    isChoice:    { type: Boolean, default: false, index: true },

    isSuspended: { type: Boolean, default: false, index: true },

    stripe_account_id: { type: String, default: null, index: true },

    // Dev seeding flags — exclude from production queries
    simSeeded:    { type: Boolean, default: false, index: true },
    simArchetype: { type: String, trim: true, maxlength: 50 },

    /* FIX #39 — ratingCount for feed card display */
    rating:        { type: Number, default: 0, min: 0, max: 5 },
    ratingCount:   { type: Number, default: 0, min: 0 },
    completedJobs: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

/* -------------------------------------------------------
   INDEXES
-------------------------------------------------------- */
providerSchema.index({ isPublic: 1, city: 1 });

providerSchema.index({
  businessName: "text",
  city: "text",
  description: "text",
  category: "text",
});

// FIX #40 — 2dsphere index for geo queries
providerSchema.index({ geoLocation: "2dsphere" }, { sparse: true });

/* -------------------------------------------------------
   PRE-SAVE NORMALIZATION
-------------------------------------------------------- */
providerSchema.pre("save", function (next) {
  if (typeof this.businessName === "string") this.businessName = this.businessName.trim();
  if (typeof this.phone === "string")        this.phone = this.phone.trim();
  if (typeof this.email === "string")        this.email = this.email.trim().toLowerCase();
  if (typeof this.city === "string")         this.city = this.city.trim();
  if (typeof this.state === "string")        this.state = this.state.trim();
  if (typeof this.country === "string")      this.country = this.country.trim();
  if (typeof this.tagline === "string")      this.tagline = this.tagline.trim();
  next();
});

/* -------------------------------------------------------
   CLEAN JSON OUTPUT
-------------------------------------------------------- */
providerSchema.set("toJSON", {
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  },
});

/* -------------------------------------------------------
   EXPORTS
-------------------------------------------------------- */
export const Provider = mongoose.model("Provider", providerSchema);
export default Provider;