// src/models/CustomerTimeline.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/* ============================================================
   CUSTOMER TIMELINE MODEL — PRODUCTION HARDENED (B17)
============================================================ */
const customerTimelineSchema = new Schema(
  {
    /* --------------------------------------------------------
       PROVIDER SCOPE (REQUIRED FOR MULTI-TENANCY SECURITY)
    -------------------------------------------------------- */
    provider: {
      type: Schema.Types.ObjectId,
      ref: "Provider",
      required: true,
      index: true,
    },

    /* --------------------------------------------------------
       PRIMARY CUSTOMER (required)
       NOTE: Must reference Customer, NOT Client
    -------------------------------------------------------- */
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },

    /* --------------------------------------------------------
       TYPE OF EVENT (CRM + Billing + System Events)
    -------------------------------------------------------- */
    type: {
      type: String,
      enum: [
        "note",
        "call",
        "email",
        "invoice",
        "invoice_payment",
        "subscription_created",
        "subscription_charge",
        "subscription_canceled",
        "payment",
        "terminal_payment",
        "system",
        "other",
      ],
      default: "note",
      index: true,
    },

    /* --------------------------------------------------------
       TITLE + DESCRIPTION
    -------------------------------------------------------- */
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 2000,
    },

    /* --------------------------------------------------------
       OPTIONAL FINANCIAL VALUE (payments, invoices, etc.)
    -------------------------------------------------------- */
    amount: {
      type: Number,
      min: 0,
    },

    /* --------------------------------------------------------
       LINKS TO OTHER DOCUMENTS
    -------------------------------------------------------- */
    invoice: {
      type: Schema.Types.ObjectId,
      ref: "Invoice",
      index: true,
    },

    subscription: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
      index: true,
    },

    subscriptionCharge: {
      type: Schema.Types.ObjectId,
      ref: "SubscriptionCharge",
      index: true,
    },

    /* --------------------------------------------------------
       ORIGIN (for auditing + analytics)
       Helps differentiate manual actions vs. automations
    -------------------------------------------------------- */
    origin: {
      type: String,
      enum: [
        "manual",
        "system",
        "invoice",
        "invoice_payment",
        "subscription",
        "subscription_charge",
        "terminal",
        "api",
      ],
      default: "manual",
    },

    /* --------------------------------------------------------
       FREE METADATA (optional)
       Allows controllers to attach contextual info
    -------------------------------------------------------- */
    meta: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

/* ============================================================
   INDEXES FOR PERFORMANCE
============================================================ */
customerTimelineSchema.index({ provider: 1, customer: 1, createdAt: -1 });
customerTimelineSchema.index({ customer: 1, createdAt: -1 });
customerTimelineSchema.index({ type: 1 });
customerTimelineSchema.index({ createdAt: -1 });

/* ============================================================
   CLEAN JSON RETURN
============================================================ */
customerTimelineSchema.set("toJSON", {
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  },
});

export const CustomerTimeline = mongoose.model(
  "CustomerTimeline",
  customerTimelineSchema
);
