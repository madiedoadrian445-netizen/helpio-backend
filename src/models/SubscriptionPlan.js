// src/models/SubscriptionPlan.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/* -------------------------------------------------------
   Allowed Billing Frequencies
-------------------------------------------------------- */
const BILLING_FREQUENCIES = [
  "weekly",
  "biweekly",
  "monthly",
  "yearly",
  "custom",
];

/* -------------------------------------------------------
   Subscription Plan Schema (B17 Hardened)
-------------------------------------------------------- */
const SubscriptionPlanSchema = new Schema(
  {
    /* ---------------------------------------------------
       PROVIDER — scoped per provider
    ----------------------------------------------------*/
    provider: {
      type: Schema.Types.ObjectId,
      ref: "Provider",
      required: true,
      index: true,
    },

    /* ---------------------------------------------------
       IDENTITY
    ----------------------------------------------------*/
    planName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 3000,
    },

    /* ---------------------------------------------------
       PRICING
    ----------------------------------------------------*/
    price: {
      type: Number,
      required: true,
      min: [0, "Price must be positive"],
    },

    currency: {
      type: String,
      default: "usd",
      lowercase: true,
    },

    /* ---------------------------------------------------
       BILLING CONFIG
    ----------------------------------------------------*/
    billingFrequency: {
      type: String,
      enum: BILLING_FREQUENCIES,
      default: "monthly",
    },

    /* custom interval example:
       every: 3
       unit: "weeks"
    */
    customInterval: {
      every: { type: Number, min: 1 },
      unit: {
        type: String,
        enum: ["days", "weeks", "months"],
      },
    },

    /* Whether Helpio Pay automatically charges card on file */
    autoBilling: {
      type: Boolean,
      default: true,
    },

    /* ---------------------------------------------------
       LIMITS / OPTIONS
    ----------------------------------------------------*/
    maxCycles: {
      type: Number,
      default: null, // unlimited
      min: 1,
    },

    prorateChanges: {
      type: Boolean,
      default: true,
    },

    allowPause: {
      type: Boolean,
      default: true,
    },

    /* ---------------------------------------------------
       TRIAL SUPPORT
    ----------------------------------------------------*/
    hasTrial: {
      type: Boolean,
      default: false,
    },

    trial: {
      length: { type: Number, min: 1 },
      unit: { type: String, enum: ["days", "weeks"] },
    },

    /* ---------------------------------------------------
       REMINDERS / NOTIFICATIONS
    ----------------------------------------------------*/
    reminder: {
      daysBefore: { type: Number, min: 1, max: 30 },
    },

    /* Provider can lock customers into a minimum # of cycles */
    minCyclesLock: {
      minCycles: { type: Number, min: 1 },
    },

    /* ---------------------------------------------------
       PLAN VERSIONING (CRITICAL)
       Helps you modify a plan without changing active subs.
    ----------------------------------------------------*/
    version: {
      type: Number,
      default: 1,
    },

    /* If plan becomes inactive, new subscriptions can't use it */
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

/* -------------------------------------------------------
   Index for provider plan lookups
-------------------------------------------------------- */
SubscriptionPlanSchema.index({ provider: 1, active: 1 });

export default mongoose.model("SubscriptionPlan", SubscriptionPlanSchema);
