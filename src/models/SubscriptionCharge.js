// src/models/SubscriptionCharge.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/* -------------------------------------------------------
   ALLOWED STATUSES
-------------------------------------------------------- */
export const SUBSCRIPTION_CHARGE_STATUSES = [
  "paid",
  "failed",
  "refunded",
];

/* -------------------------------------------------------
   SubscriptionCharge Schema (B17 Hardened)
-------------------------------------------------------- */
const SubscriptionChargeSchema = new Schema(
  {
    /* -----------------------------
       RELATIONSHIPS
    ------------------------------ */
    provider: {
      type: Schema.Types.ObjectId,
      ref: "Provider",
      required: true,
      index: true,
    },

    client: {
      type: Schema.Types.ObjectId,
      ref: "Client",
      required: true,
      index: true,
    },

    subscription: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
      required: true,
      index: true,
    },

    plan: {
      type: Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      required: true,
    },

    /* -----------------------------
       AMOUNT / CURRENCY
    ------------------------------ */
    amount: {
      type: Number,
      required: true,
      min: [0, "Amount cannot be negative"],
    },

    currency: {
      type: String,
      default: "usd",         // ✅ normalized to lowercase
      lowercase: true,
      trim: true,
      maxlength: [10, "Currency code is too long"],
    },

    /* -----------------------------
       STATUS
    ------------------------------ */
    status: {
      type: String,
      enum: SUBSCRIPTION_CHARGE_STATUSES,
      default: "paid",
      index: true,
    },

    /* -----------------------------
       BILLING METADATA
       billedAt = when charge was attempted/created
    ------------------------------ */
    billedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    method: {
      type: String,
      default: "helpio_pay",  // consistent label; we override in controllers
      trim: true,
      maxlength: [100, "Payment method label is too long"],
    },

    /* -----------------------------
       STRIPE / EXTERNAL PAYMENT
    ------------------------------ */
    externalPaymentId: {
      type: String, // Stripe PaymentIntent ID (or similar)
      trim: true,
      index: true,
      maxlength: [200, "External payment ID is too long"],
    },

    failureReason: {
      type: String,
      trim: true,
      maxlength: [1000, "Failure reason is too long"],
    },
  },
  { timestamps: true }
);

/* -------------------------------------------------------
   INDEXES
-------------------------------------------------------- */
// Quick dashboard stats: by provider + status + billedAt
SubscriptionChargeSchema.index({
  provider: 1,
  status: 1,
  billedAt: -1,
});

// Fast lookup of all charges for a subscription
SubscriptionChargeSchema.index({
  subscription: 1,
  billedAt: -1,
});

/* -------------------------------------------------------
   PRE-SAVE NORMALIZATION
-------------------------------------------------------- */
SubscriptionChargeSchema.pre("save", function (next) {
  if (typeof this.method === "string") {
    this.method = this.method.trim();
  }
  if (typeof this.currency === "string") {
    this.currency = this.currency.trim().toLowerCase();
  }
  if (typeof this.failureReason === "string") {
    this.failureReason = this.failureReason.trim();
  }
  next();
});

/* -------------------------------------------------------
   toJSON CLEANUP
-------------------------------------------------------- */
SubscriptionChargeSchema.set("toJSON", {
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model("SubscriptionCharge", SubscriptionChargeSchema);
