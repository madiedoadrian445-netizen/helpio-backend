// src/models/Customer.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/* ============================================================
   MAIN CUSTOMER SCHEMA — PRODUCTION HARDENED (B17)
============================================================ */
const customerSchema = new Schema(
  {
    /* --------------------------------------------------------
       PROVIDER OWNERSHIP (MANDATORY FOR MULTI-TENANCY)
    -------------------------------------------------------- */
    provider: {
      type: Schema.Types.ObjectId,
      ref: "Provider",
      required: true,
      index: true,
    },

    /* --------------------------------------------------------
       IDENTITY + CONTACT
    -------------------------------------------------------- */
    name: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [120, "Name cannot exceed 120 characters"],
      index: true,
    },

    phone: {
      type: String,
      trim: true,
      minlength: [7, "Phone number seems too short"],
      maxlength: [20, "Phone number seems too long"],
      index: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: [160, "Email cannot exceed 160 characters"],
      validate: {
        validator: (v) => {
          if (!v) return true;
          return /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@(([^<>()[\]\.,;:\s@"]+\.)+[^<>()[\]\.,;:\s@"]{2,})$/i.test(
            v
          );
        },
        message: "Invalid email format",
      },
      index: true,
    },

    address: {
      type: String,
      trim: true,
      maxlength: [300, "Address cannot exceed 300 characters"],
    },

    /* --------------------------------------------------------
       INTERNAL NOTES
    -------------------------------------------------------- */
    notes: {
      type: String,
      trim: true,
      maxlength: [3000, "Notes cannot exceed 3000 characters"],
    },

    /* --------------------------------------------------------
       TAGGING SYSTEM (SAFELISTED)
    -------------------------------------------------------- */
    tags: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) =>
          Array.isArray(arr) &&
          arr.length <= 50 &&
          arr.every(
            (t) => typeof t === "string" && t.trim().length <= 60
          ),
        message: "Tags must be an array of short strings (max 50 tags)",
      },
    },

    /* --------------------------------------------------------
       FINANCIAL SNAPSHOT (USED BY INVOICES + LEDGER)
    -------------------------------------------------------- */
    totalInvoiced: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalPaid: {
      type: Number,
      default: 0,
      min: 0,
    },

    lastInvoiceAt: {
      type: Date,
    },

    /* --------------------------------------------------------
       LAST CONTACT (used by CRM sorting + activity)
    -------------------------------------------------------- */
    lastContactAt: {
      type: Date,
      index: true,
    },

    /* --------------------------------------------------------
       OPTIONAL QUICK TIMELINE SHORTCUT
       (The *real* timeline is CustomerTimeline collection)
    -------------------------------------------------------- */
    lastInteractionType: {
      type: String,
      enum: ["note", "call", "invoice", "subscription", "system"],
    },

    lastInteractionAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

/* ============================================================
   INDEXES FOR HIGH-SPEED CRM / INVOICE QUERIES
============================================================ */
customerSchema.index({ provider: 1, name: 1 });
customerSchema.index({ provider: 1, email: 1 });
customerSchema.index({ provider: 1, phone: 1 });
customerSchema.index({ provider: 1, createdAt: -1 });
customerSchema.index({ provider: 1, lastContactAt: -1 });
customerSchema.index({ provider: 1, totalInvoiced: -1 });

customerSchema.index({
  name: "text",
  email: "text",
  phone: "text",
  notes: "text",
});

/* ============================================================
   PRE-SAVE NORMALIZATION
============================================================ */
customerSchema.pre("save", function (next) {
  if (typeof this.name === "string") this.name = this.name.trim();
  if (typeof this.phone === "string") this.phone = this.phone.trim();
  if (typeof this.email === "string") this.email = this.email.trim().toLowerCase();
  if (typeof this.address === "string") this.address = this.address.trim();
  if (typeof this.notes === "string") this.notes = this.notes.trim();
  next();
});

/* ============================================================
   JSON TRANSFORM
============================================================ */
customerSchema.set("toJSON", {
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  },
});

/* ============================================================
   EXPORTS — BOTH NAMED + DEFAULT
============================================================ */
export const Customer = mongoose.model("Customer", customerSchema);
export default Customer;
