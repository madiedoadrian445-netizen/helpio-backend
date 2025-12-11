// src/utils/idempotency.js
import crypto from "crypto";
import IdempotencyKey from "../models/IdempotencyKey.js";

/* ========================================================================
   HASHING UTILITY
   Strong SHA-256 hashing for request payload verification.
========================================================================= */

export const hashRequestPayload = (payload) => {
  if (!payload) return null;

  try {
    const json = JSON.stringify(payload);
    return crypto.createHash("sha256").update(json).digest("hex");
  } catch (err) {
    console.warn("⚠️ Failed to hash payload:", err.message);
    return null;
  }
};

/* ========================================================================
   RESERVE IDEMPOTENCY KEY
   Core function used by ALL payment operations:
     • invoice charges
     • subscription renewals
     • terminal payments
     • payouts
     • refunds
     • ledger adjustments

   Enforces:
     - one-time execution
     - payload consistency
     - amount & currency consistency
     - strong metadata correlation
=========================================================================== */

export const reserveIdempotencyKey = async ({
  key,
  type,
  amount,
  currency,

  // Cross-reference support
  subscriptionId,
  invoiceId,
  providerId,
  customerId,
  terminalPaymentId,

  initiatedBy = "api",
  payloadForHash,
  extraContext = {},
}) => {
  if (!key) throw new Error("Idempotency key is required");
  if (!type) throw new Error("Idempotency key 'type' is required");

  const requestHash = hashRequestPayload(payloadForHash);

  /* ----------------------------------------------------------------------
     UPSERT BEHAVIOR
     If record exists:
       → validate amounts, hash, and consistency
     If new:
       → create reserved key record
  ----------------------------------------------------------------------- */
  const result = await IdempotencyKey.findOneAndUpdate(
    { key, type },
    {
      $setOnInsert: {
        key,
        type,
        amount,
        currency,

        subscriptionId: subscriptionId || undefined,
        invoiceId: invoiceId || undefined,
        providerId: providerId || undefined,
        customerId: customerId || undefined,
        terminalPaymentId: terminalPaymentId || undefined,

        requestHash,
        initiatedBy,
        status: "in_progress",

        context: {
          ...extraContext,
          createdAt: new Date().toISOString(),
        },
      },
    },
    {
      upsert: true,
      new: true,
      rawResult: true,
    }
  );

  const record = result.value;
  const wasExisting = result.lastErrorObject?.updatedExisting;

  /* =====================================================================
       EXISTING KEY → VALIDATE STATE
  ====================================================================== */
  if (wasExisting) {
    // Amount & currency mismatch → block replay attempt
    if (record.amount !== amount || record.currency !== currency) {
      throw new Error(
        "Idempotency key reuse with mismatched amount/currency is not allowed"
      );
    }

    // Payload mismatch
    if (
      requestHash &&
      record.requestHash &&
      record.requestHash !== requestHash
    ) {
      throw new Error(
        "Idempotency key reuse with different request payload is not allowed"
      );
    }

    // Completed replay allowed (safe)
    if (record.status === "completed") {
      return { status: "existing_completed", record };
    }

    // In-progress replay → lock the operation
    if (record.status === "in_progress") {
      return { status: "existing_in_progress", record };
    }

    // Failed → blocked unless retried with new key
    if (record.status === "failed") {
      return { status: "existing_failed", record };
    }
  }

  /* ---------------------------------------------------------------------
     NEW KEY RESERVED
  ---------------------------------------------------------------------- */
  return { status: "new", record };
};

/* ========================================================================
   MARK IDEMPOTENCY KEY COMPLETED
   Merge existing context with new metadata instead of overwriting.
=========================================================================== */

export const markIdempotencyKeyCompleted = async (
  idempotencyRecordId,
  {
    stripePaymentIntentId,
    stripeChargeId,
    ledgerEntryId,
    extraContext = {},
  } = {}
) => {
  if (!idempotencyRecordId) return;

  const update = {
    status: "completed",
  };

  if (stripePaymentIntentId) update.stripePaymentIntentId = stripePaymentIntentId;
  if (stripeChargeId) update.stripeChargeId = stripeChargeId;
  if (ledgerEntryId) update.ledgerEntryId = ledgerEntryId;

  update.context = {
    ...(update.context || {}),
    ...extraContext,
    completedAt: new Date().toISOString(),
  };

  await IdempotencyKey.findByIdAndUpdate(idempotencyRecordId, update);
};

/* ========================================================================
   MARK IDEMPOTENCY KEY FAILED
=========================================================================== */

export const markIdempotencyKeyFailed = async (
  idempotencyRecordId,
  { extraContext = {} } = {}
) => {
  if (!idempotencyRecordId) return;

  await IdempotencyKey.findByIdAndUpdate(idempotencyRecordId, {
    status: "failed",
    context: {
      failedAt: new Date().toISOString(),
      ...extraContext,
    },
  });
};

/* ========================================================================
   OPTIONAL TTL CLEANUP HOOK (OFF BY DEFAULT)
   Activate when needed:
   db.idempotencykeys.createIndex({ "context.createdAt": 1 }, { expireAfterSeconds: 604800 })
   → Keys expire after 7 days
=========================================================================== */
