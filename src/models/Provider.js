// src/models/Provider.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/* -------------------------------------------------------
   SOCIAL LINKS SUB-SCHEMA (Optional)
-------------------------------------------------------- */
const socialsSchema = new Schema(
  {
    instagram: { type: String, trim: true, maxlength: 200 },
    facebook: { type: String, trim: true, maxlength: 200 },
    tiktok: { type: String, trim: true, maxlength: 200 },
    youtube: { type: String, trim: true, maxlength: 200 },
    twitter: { type: String, trim: true, maxlength: 200 }, // X
    linkedin: { type: String, trim: true, maxlength: 200 }
  },
  { _id: false }
);

/* -------------------------------------------------------
   GEOLOCATION SUB-SCHEMA (Optional)
-------------------------------------------------------- */
const geoLocationSchema = new Schema(
  {
    lat: {
      type: Number,
      min: -90,
      max: 90
    },
    lng: {
      type: Number,
      min: -180,
      max: 180
    }
  },
  { _id: false }
);

/* -------------------------------------------------------
   MAIN PROVIDER SCHEMA (MERGED)
-------------------------------------------------------- */
const providerSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required for provider"],
      unique: true,
      index: true
    },

    businessName: {
      type: String,
      required: [true, "Business name is required"],
      trim: true,
      minlength: [2, "Business name must be at least 2 characters"],
      maxlength: [100, "Business name cannot exceed 100 characters"]
    },

    phone: {
      type: String,
      required: [true, "Business phone is required"],
      trim: true,
      minlength: [7, "Phone number seems too short"],
      maxlength: [20, "Phone number seems too long"]
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
        message: "Invalid email format"
      }
    },

    address: { type: String, trim: true, maxlength: 200 },
    city: { type: String, trim: true, default: "Miami", maxlength: 100 },
    state: { type: String, trim: true, default: "FL", maxlength: 100 },
    zip: { type: String, trim: true, maxlength: 20 },
    country: { type: String, trim: true, default: "USA", maxlength: 100 },

    category: { type: String, trim: true, maxlength: 100 },

    description: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: ""
    },

    services: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) =>
          Array.isArray(arr) &&
          arr.length <= 100 &&
          arr.every((s) => typeof s === "string" && s.length <= 120),
        message: "Services must be an array of short text labels"
      }
    },

    website: { type: String, trim: true, maxlength: 200 },

    socials: { type: socialsSchema, default: () => ({}) },

    geoLocation: { type: geoLocationSchema, default: null },

    logo: { type: String, trim: true, maxlength: 500 },
    logoUrl: { type: String, trim: true, maxlength: 500 },
    coverImageUrl: { type: String, trim: true, maxlength: 500 },

    gallery: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length <= 50,
        message: "Too many gallery images"
      }
    },

    isPublic: { type: Boolean, default: true, index: true },
    isVerified: { type: Boolean, default: false, index: true },
    isSuspended: { type: Boolean, default: false, index: true },

    rating: { type: Number, default: 0, min: 0, max: 5 },
    completedJobs: { type: Number, default: 0, min: 0 }
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
  category: "text"
});

/* -------------------------------------------------------
   PRE-SAVE NORMALIZATION
-------------------------------------------------------- */
providerSchema.pre("save", function (next) {
  if (typeof this.businessName === "string") this.businessName = this.businessName.trim();
  if (typeof this.phone === "string") this.phone = this.phone.trim();
  if (typeof this.email === "string") this.email = this.email.trim().toLowerCase();
  if (typeof this.city === "string") this.city = this.city.trim();
  if (typeof this.state === "string") this.state = this.state.trim();
  if (typeof this.country === "string") this.country = this.country.trim();

  if (!this.logo && this.logoUrl) this.logo = this.logoUrl;
  if (!this.logoUrl && this.logo) this.logoUrl = this.logo;

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
  }
});

/* -------------------------------------------------------
   EXPORTS — supports BOTH import styles
-------------------------------------------------------- */
export const Provider = mongoose.model("Provider", providerSchema);
export default Provider;
