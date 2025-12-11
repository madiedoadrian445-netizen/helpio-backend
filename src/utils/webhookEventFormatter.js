export const formatWebhookEventForUI = (event) => ({
  id: event._id,
  eventId: event.eventId,
  type: event.type,
  status: event.status,
  createdAt: event.createdAt,
  livemode: event.livemode,
  summary: `[${event.type}] ${event.status.toUpperCase()}`,
  color:
    event.status === "completed"
      ? "#4CAF50"
      : event.status === "failed"
      ? "#FF3B30"
      : "#FFCC00",
  payloadPreview:
    event.payload?.object?.id || event.payload?.id || "No payload",
});
