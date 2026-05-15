// src/config/redis.js
import Redis from "ioredis";

// If no REDIS_URL is set, skip Redis entirely.
// Rate limiters fall back to in-memory store automatically.
if (!process.env.REDIS_URL) {
  console.log("⚠️ No REDIS_URL set — rate limiters using in-memory store");
}

export const redisClient = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    })
  : {
      // Stub client — satisfies RedisStore import without connecting
      call: () => Promise.reject(new Error("Redis not configured")),
      on: () => {},
    };

if (process.env.REDIS_URL) {
  redisClient.on("connect", () => console.log("✅ Redis connected"));
  redisClient.on("error", (err) => console.error("❌ Redis error:", err.message));
}