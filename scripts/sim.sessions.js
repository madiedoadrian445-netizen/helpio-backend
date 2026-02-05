// scripts/sim.sessions.js
import "dotenv/config";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { connectDB } from "../src/config/db.js";

import User from "../src/models/User.js";
import Conversation from "../src/models/Conversation.js";

import { getFeed } from "../src/algorithm/feedEngine.js";
import { SIM } from "./sim.config.js";

// SAFETY
if (process.env.NODE_ENV === "production") {
  throw new Error("❌ Refusing to simulate sessions in production");
}

// HELPERS
function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function chance(p) {
  return Math.random() < p;
}

// MAIN
async function simulateSessions() {
  console.log("🧠 Simulating user sessions...");
  await connectDB();

  // Pull simulated users (non-provider users later; for now reuse pool)
  const users = await User.find({
    email: { $not: /^sim_provider_/i }
  }).limit(1000);

  if (users.length === 0) {
    console.warn("⚠️ No non-provider users found. Using provider users as stand-ins.");
  }

  const activeUsers = users.length > 0
    ? users
    : await User.find({}).limit(1000);

  let sessionCount = 0;
  const maxSessions = 10000;

  for (let i = 0; i < maxSessions; i++) {
    const user = activeUsers[Math.floor(Math.random() * activeUsers.length)];
    const sessionId = uuidv4();

    // Feed fetch (locked per session)
    const feed = await getFeed({
      userId: user._id,
      sessionId,
      feedType: "trending",
      limit: 20
    });

    // Simulate engagement
    for (const listing of feed) {
      // Impression happens implicitly

      // Click chance
      if (chance(0.15)) {
        // Unique conversation start chance
        if (chance(0.08)) {
          // Ensure 1 convo per user per listing
        const exists = await Conversation.findOne({
  customerId: user._id,
  providerId: listing.provider._id,
  serviceId: listing._id
});


if (!exists) {
 await Conversation.create({
  customerId: user._id,
  providerId: listing.provider._id,
  serviceId: listing._id,
  startedAt: new Date(),
  simSeeded: true
});

}

        }
      }
    }

    sessionCount++;

    if (i % 500 === 0) {
      console.log(`✅ Simulated ${i}/${maxSessions} sessions`);
    }
  }

  console.log(`🎉 Session simulation complete (${sessionCount} sessions)`);
  await mongoose.connection.close();
  process.exit(0);
}

simulateSessions().catch(err => {
  console.error("❌ Session simulation error:", err);
  process.exit(1);
});
