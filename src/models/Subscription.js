// src/models/Subscription.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/* -------------------------------------------------------
   Allowed statuses
-------------------------------------------------------- */
const SUBSCRIPTION_STATUSES = [
  "active",
  "paused",
  "past_due",
  "canceled",
];

/* -------------------------------------------------------
   Hardened Subscription Schema (B17 Production)
-------------------------------------------------------- */
const subscriptionSchema = new Schema(
  {
    /* ---------------------------------------------------
       RELATIONSHIPS
    ----------------------------------------------------*/
    provider: {
      type: Schema.Types.ObjectId,
      ref: "Provider",
      required: true,
      index: true,
    },

    // FIXED: must reference "Customer"
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },

    plan: {
      type: Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      required: true,
    },

    /* ---------------------------------------------------
       PLAN SNAPSHOT — prevents pricing drift
    ----------------------------------------------------*/
    planSnapshot: {
      name: String,
      description: String,
      price: Number,
      currency: String,
      billingFrequency: String,
    },

    /* ---------------------------------------------------
       STATUS HANDLING
    ----------------------------------------------------*/
    status: {
      type: String,
      enum: SUBSCRIPTION_STATUSES,
      default: "active",
      index: true,
    },

    /* ---------------------------------------------------
       BILLING + PRICING
    ----------------------------------------------------*/
    price: {
      type: Number,
      required: true,
      min: [0, "Price cannot be negative"],
    },

    currency: {
      type: String,
      default: "usd",
      lowercase: true,
    },

    billingFrequency: {
      type: String,
      enum: ["weekly", "biweekly", "monthly", "yearly"],
      default: "monthly",
    },

    /* ---------------------------------------------------
       DATES
    ----------------------------------------------------*/
    startDate: {
      type: Date,
      default: Date.now,
    },

    nextBillingDate: {
      type: Date,
      required: true,
      index: true, // Critical for CRON
    },

    trialEndDate: {
      type: Date,
      default: null,
    },

    canceledAt: {
      type: Date,
      default: null,
    },

    /* ---------------------------------------------------
       PAUSE INFORMATION
    ----------------------------------------------------*/
    pauseInfo: {
      pausedAt: { type: Date },
      resumeAt: { type: Date },
    },

    /* ---------------------------------------------------
       BILLING HISTORY COUNTER
    ----------------------------------------------------*/
    cycleCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    /* ---------------------------------------------------
       STRIPE METADATA
    ----------------------------------------------------*/
    stripeSubscriptionId: {
      type: String,
      default: null,
      index: true,
    },

    stripeLatestPaymentIntent: {
      type: String,
      default: null,
    },

    lastChargeStatus: {
      type: String,
      enum: ["success", "failed", "pending", null],
      default: null,
    },

    /* ---------------------------------------------------
       ANALYTICS + CRM ENRICHMENT
    ----------------------------------------------------*/
    activationMethod: {
      type: String,
      enum: ["manual", "card_on_file", "terminal"],
      default: "manual",
    },

    firstChargeAt: {
      type: Date,
      default: null,
    },

    lastBilledAt: {
      type: Date,
      default: null,
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

/* -------------------------------------------------------
   Index for fast cron queries
-------------------------------------------------------- */
subscriptionSchema.index({ nextBillingDate: 1, status: 1 });

/* -------------------------------------------------------
   EXPORTS — supports both named + default imports
-------------------------------------------------------- */
export const Subscription = mongoose.model("Subscription", subscriptionSchema);
export default Subscription;
