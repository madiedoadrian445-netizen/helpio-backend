// src/models/FinancialStatement.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/* -------------------------------------------------------
   SUB-SCHEMAS
-------------------------------------------------------- */
const TaxSummarySchema = new Schema(
  {
    taxableVolume: { type: Number, default: 0 },
    taxCollected: { type: Number, default: 0 },
    taxWithheld: { type: Number, default: 0 },
  },
  { _id: false }
);

const TotalsSchema = new Schema(
  {
    grossVolume: { type: Number, default: 0 },
    refundsTotal: { type: Number, default: 0 },
    disputesTotal: { type: Number, default: 0 },
    feesTotal: { type: Number, default: 0 },
    payoutsTotal: { type: Number, default: 0 },
    balanceChange: { type: Number, default: 0 },
    netVolume: { type: Number, default: 0 },
  },
  { _id: false }
);

/* -------------------------------------------------------
   MAIN SCHEMA
-------------------------------------------------------- */
const FinancialStatementSchema = new Schema(
  {
    provider: {
      type: Schema.Types.ObjectId,
      ref: "Provider",
      required: true,
      index: true,
    },

    year: { type: Number, required: true },
    month: { type: Number, required: true },

    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },

    currency: {
      type: String,
      default: "usd",
      lowercase: true,
      trim: true,
    },

    totals: { type: TotalsSchema, default: () => ({}) },
    tax: { type: TaxSummarySchema, default: () => ({}) },

    status: {
      type: String,
      enum: ["final", "pending", "void"],
      default: "final",
      index: true,
    },

    metadata: {
      generatedBy: {
        type: String,
        enum: ["system", "manual"],
        default: "system",
      },
      source: { type: String, default: "ledger-engine" },
      notes: { type: String },
    },
  },
  { timestamps: true }
);

/* -------------------------------------------------------
   INDEXES
-------------------------------------------------------- */
FinancialStatementSchema.index(
  { provider: 1, year: 1, month: 1, currency: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $ne: "void" } },
  }
);

/* -------------------------------------------------------
   CLEAN JSON OUTPUT
-------------------------------------------------------- */
FinancialStatementSchema.set("toJSON", {
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  },
});

/* -------------------------------------------------------
   MODEL EXPORTS (NAMED + DEFAULT)
-------------------------------------------------------- */
export const FinancialStatement = mongoose.model(
  "FinancialStatement",
  FinancialStatementSchema
);

export default FinancialStatement;
