import rateLimit from "express-rate-limit";
import { logInfo } from "../utils/logger.js";

/**
 * STRICT MODE PAYMENT ABUSE PREVENTION
 * ------------------------------------
 * This middleware:
 *  - Blocks rapid-fire payment attempts
 *  - Detects suspicious patterns
 *  - Enforces cooldown windows
 *  - Protects Tap-to-Pay + Invoices + Subscriptions
 *  - Prevents brute force invoice payment attempts
 */

const ATTEMPT_WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_ATTEMPTS = 8; // max requests/minute per IP
const MAX_PROVIDER_ATTEMPTS = 12; // provider-wide
const MAX_CUSTOMER_ATTEMPTS = 5; // repeated customer charges

// cooldown rules
const IP_COOLDOWN_MS = 90 * 1000;
const PROVIDER_COOLDOWN_MS = 120 * 1000;
const CUSTOMER_COOLDOWN_MS = 120 * 1000;

// in-memory counters
const ipHits = new Map();
const providerHits = new Map();
const customerHits = new Map();
const ipCooldown = new Map();
const providerCooldown = new Map();
const customerCooldown = new Map();

const now = () => Date.now();

/* ----------------------------
   CLEAN OLD ENTRIES
----------------------------- */
function cleanup(map) {
  for (const [key, arr] of map.entries()) {
    const filtered = arr.filter((t) => now() - t < ATTEMPT_WINDOW_MS);
    if (filtered.length === 0) map.delete(key);
    else map.set(key, filtered);
  }
}

/* ----------------------------
   STRICT LIMITER FUNCTION
----------------------------- */
export const helpioPayLimiter = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const providerId = req.user?.providerId || req.user?._id || null;
  const customerId = req.body?.customerId || req.body?.clientId || null;

  const current = now();

  /* ------------------------------------------------
     COOLDOWN CHECKS
  ------------------------------------------------ */
  if (ipCooldown.has(ip) && current < ipCooldown.get(ip)) {
    return res.status(429).json({
      success: false,
      message:
        "Too many Helpio Pay attempts from this device. Please wait and try again.",
    });
  }

  if (
    providerId &&
    providerCooldown.has(providerId) &&
    current < providerCooldown.get(providerId)
  ) {
    return res.status(429).json({
      success: false,
      message:
        "Your Helpio Pay terminal is temporarily rate-limited due to unusual activity.",
    });
  }

  if (
    customerId &&
    customerCooldown.has(customerId) &&
    current < customerCooldown.get(customerId)
  ) {
    return res.status(429).json({
      success: false,
      message:
        "This customer has too many recent payment attempts. Please try again shortly.",
    });
  }

  /* ------------------------------------------------
     RECORD ATTEMPTS
  ------------------------------------------------ */
  const record = (map, key) => {
    if (!key) return;
    const arr = map.get(key) || [];
    arr.push(current);
    map.set(key, arr);
  };

  record(ipHits, ip);
  record(providerHits, providerId);
  record(customerHits, customerId);

  cleanup(ipHits);
  cleanup(providerHits);
  cleanup(customerHits);

  /* ------------------------------------------------
     HARD LIMITS
  ------------------------------------------------ */
  const ipCount = ipHits.get(ip)?.length || 0;
  const providerCount = providerHits.get(providerId)?.length || 0;
  const customerCount = customerHits.get(customerId)?.length || 0;

  // IP Limit
  if (ipCount > MAX_ATTEMPTS) {
    ipCooldown.set(ip, current + IP_COOLDOWN_MS);

    logInfo("helpioPay.abuse.ip_limited", {
      ip,
      attempts: ipCount,
      cooldownMs: IP_COOLDOWN_MS,
      route: req.originalUrl,
    });

    return res.status(429).json({
      success: false,
      message:
        "Too many Helpio Pay requests. Your device has been temporarily rate-limited.",
    });
  }

  // Provider Limit
  if (providerId && providerCount > MAX_PROVIDER_ATTEMPTS) {
    providerCooldown.set(providerId, current + PROVIDER_COOLDOWN_MS);

    logInfo("helpioPay.abuse.provider_limited", {
      providerId,
      attempts: providerCount,
      cooldownMs: PROVIDER_COOLDOWN_MS,
      route: req.originalUrl,
    });

    return res.status(429).json({
      success: false,
      message:
        "Your Helpio Pay terminal is temporarily blocked due to excessive activity.",
    });
  }

  // Customer Limit
  if (customerId && customerCount > MAX_CUSTOMER_ATTEMPTS) {
    customerCooldown.set(customerId, current + CUSTOMER_COOLDOWN_MS);

    logInfo("helpioPay.abuse.customer_limited", {
      customerId,
      attempts: customerCount,
      cooldownMs: CUSTOMER_COOLDOWN_MS,
      route: req.originalUrl,
    });

    return res.status(429).json({
      success: false,
      message:
        "This customer has reached the maximum number of payment attempts for now.",
    });
  }

  next();
};

/* -------------------------------------------------------
   STRICT ADMIN LIMITER (new)
   Protects dispute resolution, forced payouts, etc.
-------------------------------------------------------- */

export const strictAdminLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // only 10 dangerous admin actions per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message:
      "Admin action rate limit reached. This operation is temporarily blocked for security reasons.",
  },
});
