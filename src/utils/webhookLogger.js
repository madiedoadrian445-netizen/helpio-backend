// src/utils/webhookLogger.js
import WebhookEventLog from "../models/WebhookEventLog.js";

export const logWebhookReceived = async (event) => {
  if (!event?.id) return;

  try {
    await WebhookEventLog.findOneAndUpdate(
      { eventId: event.id },
      {
        eventId: event.id,
        type: event.type || "unknown",
        payload: event.data || {},
        livemode: event.livemode || false,
        status: "received",
      },
      { upsert: true }
    );
  } catch (err) {
    console.error("⚠️ Failed to log received webhook:", err.message);
  }
};

export const logWebhookCompleted = async (eventId) => {
  try {
    await WebhookEventLog.findOneAndUpdate(
      { eventId },
      { status: "completed" }
    );
  } catch (err) {
    console.error("⚠️ Failed to log webhook completion:", err.message);
  }
};

export const logWebhookFailed = async (eventId, error) => {
  try {
    await WebhookEventLog.findOneAndUpdate(
      { eventId },
      { status: "failed", error }
    );
  } catch (err) {
    console.error("⚠️ Failed to log webhook failure:", err.message);
  }
};
