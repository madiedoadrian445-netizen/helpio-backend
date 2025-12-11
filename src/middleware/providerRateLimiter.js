// src/middleware/providerRateLimiter.js

/**
 * In-memory provider-level rate limiter.
 *
 * Scope: per provider, per route+method, per time window.
 *
 * NOTE:
 * - This is node-process local. For multi-instance / horizontal scaling,
 *   you should swap the backing store with Redis or another shared cache.
 */

const buckets = new Map();

/**
 * Create a provider rate limiter middleware.
 *
 * @param {Object} options
 * @param {number} options.windowMs - Time window in ms (default: 60s)
 * @param {number} options.max - Max requests per window per provider+route (default: 60)
 * @param {string} [options.name] - Optional label for error message / logging
 * @param {function} [options.keyGenerator] - Custom key generator
 */
export const providerRateLimiter = ({
  windowMs = 60 * 1000,
  max = 60,
  name = "Helpio provider rate limit",
  keyGenerator,
} = {}) => {
  return (req, res, next) => {
    try {
      // You MUST call this after `protect`, so req.user is set.
      const providerId =
        req.user?.provider || req.user?._id || req.headers["x-provider-id"];

      if (!providerId) {
        // If we can't identify provider, just skip provider-level limit.
        return next();
      }

      // Default key: provider + method + route base (keeps limits per route)
      const defaultKey = `${providerId}:${req.method}:${req.baseUrl || req.path}`;
      const key = keyGenerator ? keyGenerator(req, defaultKey) : defaultKey;

      const now = Date.now();
      const windowStart = now - windowMs;

      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = [];
        buckets.set(key, bucket);
      }

      // Remove timestamps outside of current window
      while (bucket.length && bucket[0] < windowStart) {
        bucket.shift();
      }

      // Check current count
      if (bucket.length >= max) {
        return res.status(429).json({
          success: false,
          message:
            "Too many requests from this provider. Please slow down or try again in a moment.",
          error: {
            type: "PROVIDER_RATE_LIMIT",
            scope: name,
            windowMs,
            max,
          },
        });
      }

      // Record this request
      bucket.push(now);

      return next();
    } catch (err) {
      // On any unexpected error, don't block the request — just continue.
      return next();
    }
  };
};
