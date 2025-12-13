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
    // ✅ Structured log (for aggregators)
    console.log(JSON.stringify(payload));

    // 🔥 Render-visible log (prevents collapsing)
    console.log(
      `[${level.toUpperCase()}] ${message}`,
      Object.keys(context).length ? context : ""
    );
  } else {
    // 🧑‍💻 Dev-friendly logs
    console.log(`[${level.toUpperCase()}] ${message}`, context);
  }
};

export const logInfo = (message, context = {}) =>
  baseLog("info", message, context);

export const logError = (message, context = {}) =>
  baseLog("error", message, context);

export const logPaymentEvent = (event, context = {}) =>
  baseLog("payment", `💳 ${event}`, context);

export const logCron = (event, context = {}) =>
  baseLog("cron", event, context);
