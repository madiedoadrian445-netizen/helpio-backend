// src/models/LedgerAccount.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * LedgerAccount
 *
 * One per provider (and optionally one global "platform" account per currency).
 * All money movements are tracked via LedgerEntry rows against these accounts.
 *
 * All amounts are stored in CENTS (integers) for safety:
 *  - 1000 = $10.00
 */
const ledgerAccountSchema = new Schema(
  {
    // Who this account belongs to (null for platform / system account)
    provider: {
      type: Schema.Types.ObjectId,
      ref: "Provider",
      index: true,
      default: null,
    },

    // Optional: client/customer level accounts (if needed later)
    customer: {
      type: Schema.Types.ObjectId,
      ref: "Client",
      index: true,
      default: null,
    },

    // e.g. "provider", "platform", "customer"
    accountType: {
      type: String,
      enum: ["provider", "platform", "customer"],
      required: true,
      default: "provider",
      index: true,
    },

    currency: {
      type: String,
      default: "usd",
      lowercase: true,
      index: true,
    },

    // Current net balance of this account in cents.
    // For providers:
    //   positive = Helpio owes provider
    //   negative = provider owes Helpio (e.g. refunds > charges, disputes, etc)
    currentBalanceCents: {
      type: Number,
      default: 0,
    },

    // Convenience buckets (denormalized for fast UI)
    pendingCents: {
      type: Number,
      default: 0, // funds in T+7 window
    },
    availableCents: {
      type: Number,
      default: 0, // available to payout
    },
    onHoldCents: {
      type: Number,
      default: 0, // disputes / holds
    },
    paidOutCents: {
      type: Number,
      default: 0, // total payouts sent
    },

    // Soft-delete flag, just in case
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

// Optional unique: 1 provider + 1 currency + type
ledgerAccountSchema.index(
  { provider: 1, customer: 1, accountType: 1, currency: 1 },
  { unique: true }
);

const LedgerAccount = mongoose.model("LedgerAccount", ledgerAccountSchema);

export default LedgerAccount;
