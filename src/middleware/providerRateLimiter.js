// src/middleware/providerRateLimiter.js

/**
 * In-memory provider-level rate limiter.
 * Scope: per provider, per route+method, per time window.
 *
 * NOTE: This is node-process local. For multi-instance scaling,
 * swap the backing store with Redis.
 */

const buckets = new Map();

export const providerRateLimiter = ({
  windowMs = 60 * 1000,
  max = 60,
  name = "Helpio provider rate limit",
  keyGenerator,
} = {}) => {
  return (req, res, next) => {
    try {
      // FIX #52 — use providerId not provider
      // req.user.provider doesn't exist — auth middleware sets providerId
      const providerId =
        req.user?.providerId || req.user?._id || req.headers["x-provider-id"];

      if (!providerId) return next();

      const defaultKey = `${providerId}:${req.method}:${req.baseUrl || req.path}`;
      const key = keyGenerator ? keyGenerator(req, defaultKey) : defaultKey;

      const now = Date.now();
      const windowStart = now - windowMs;

      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = [];
        buckets.set(key, bucket);
      }

      // Remove timestamps outside current window
      while (bucket.length && bucket[0] < windowStart) {
        bucket.shift();
      }

      // FIX #51 — delete empty buckets to prevent unbounded Map growth
      // Without this, every unique provider+method+route permanently
      // occupies memory even after their window expires
      if (bucket.length === 0) {
        buckets.delete(key);
        bucket = [];
        buckets.set(key, bucket);
      }

      if (bucket.length >= max) {
        return res.status(429).json({
          success: false,
          message: "Too many requests from this provider. Please slow down or try again in a moment.",
          error: {
            type: "PROVIDER_RATE_LIMIT",
            scope: name,
            windowMs,
            max,
          },
        });
      }

      bucket.push(now);
      return next();
    } catch (err) {
      return next();
    }
  };
};