// src/utils/webhookIdempotency.js
import IdempotencyKey from "../models/IdempotencyKey.js";

/**
 * Reserve processing for a Stripe webhook event.
 *
 * - First time we see event.id  -> status: "new"
 * - Subsequent times:
 *      - record.status === "completed" -> already processed
 *      - record.status === "failed"    -> previously failed
 *      - record.status === "in_progress" -> being processed (rare)
 */
export const reserveWebhookEvent = async (event) => {
  if (!event || !event.id) {
    throw new Error("Stripe event must have an id for webhook idempotency.");
  }

  const key = `webhook:${event.id}`;

  const result = await IdempotencyKey.findOneAndUpdate(
    { key, type: "webhook_event" },
    {
      $setOnInsert: {
        key,
        type: "webhook_event",
        status: "in_progress",
        context: {
          stripeEventType: event.type || null,
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
  const existed = result.lastErrorObject.updatedExisting;

  if (existed) {
    // We’ve seen this event before → respect its last status
    return { status: record.status, record };
  }

  // Brand new event
  return { status: "new", record };
};

export const markWebhookCompleted = async (recordId) => {
  if (!recordId) return;
  await IdempotencyKey.findByIdAndUpdate(recordId, {
    status: "completed",
  });
};

export const markWebhookFailed = async (recordId, reason) => {
  if (!recordId) return;
  await IdempotencyKey.findByIdAndUpdate(recordId, {
    status: "failed",
    context: { error: reason },
  });
};
