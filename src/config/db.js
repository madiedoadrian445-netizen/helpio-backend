// src/config/db.js
import mongoose from "mongoose";

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // FIX #13 — Connection pool
      // Default pool size is 5 — saturates instantly at 50k users.
      // 100 concurrent connections keeps queries flowing under load.
      maxPoolSize: 100,
      minPoolSize: 10,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 5000,
      heartbeatFrequencyMS: 10000,
    });

    console.log("📦 MongoDB connected");

    // FIX #14 — Reconnection handlers
    mongoose.connection.on("disconnected", () => {
      console.error("❌ MongoDB disconnected");
    });

    mongoose.connection.on("error", (err) => {
      console.error("❌ MongoDB error:", err.message);
    });

    mongoose.connection.on("reconnected", () => {
      console.log("✅ MongoDB reconnected");
    });

  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  }
};

// FIX #14 — Graceful shutdown
// Without this, open DB connections are left hanging when
// the process is killed by Render or a deploy restart.
process.on("SIGINT", async () => {
  await mongoose.connection.close();
  console.log("MongoDB connection closed on SIGINT");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await mongoose.connection.close();
  console.log("MongoDB connection closed on SIGTERM");
  process.exit(0);
});