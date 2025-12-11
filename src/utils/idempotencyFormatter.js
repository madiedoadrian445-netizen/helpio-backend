// src/utils/idempotencyFormatter.js

/**
 * Formats an idempotency record for API response or internal logging.
 */
export const formatIdempotencyRecord = (record) => {
  if (!record) return null;

  return {
    idempotencyKey: record.key,
    requestHash: record.requestHash,
    responseHash: record.responseHash,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
    requestBody: record.requestBody,
    responseBody: record.responseBody
  };
};

/**
 * Legacy alias used by older controllers
 */
export const formatIdempotencyResponse = formatIdempotencyRecord;

export default {
  formatIdempotencyRecord,
  formatIdempotencyResponse
};
