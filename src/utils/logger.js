// src/utils/logger.js

const isProd = process.env.NODE_ENV === "production";

const baseLog = (level, message, context = {}) => {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };

  if (isProd) {
    // In production, log a single JSON line (great for log aggregators)
    console.log(JSON.stringify(payload));
  } else {
    // In development, keep it readable
    // eslint-disable-next-line no-console
    console.log(`[${level.toUpperCase()}] ${message}`, context);
  }
};

export const logInfo = (message, context = {}) =>
  baseLog("info", message, context);

export const logError = (message, context = {}) =>
  baseLog("error", message, context);

export const logPaymentEvent = (event, context = {}) =>
  baseLog("payment", event, context);

export const logCron = (event, context = {}) =>
  baseLog("cron", event, context);
