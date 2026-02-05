// scripts/seed.users.js
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import User from "../src/models/User.js";
import { SIM } from "./sim.config.js";

// SAFETY
if (process.env.NODE_ENV === "production") {
  throw new Error("❌ Refusing to seed users in production");
}

function randomEmail(i) {
  return `sim_provider_${i}@helpio.dev`;
}

function randomPhone(i) {
  return `+1555${String(1000000 + i).slice(-7)}`;
}

async function seedUsers() {
  console.log("👤 Seeding provider-owner users...");
  await connectDB();

  // Clean old simulated users
  await User.deleteMany({ simSeeded: true });

  const users = [];

  for (let i = 0; i < SIM.counts.providers; i++) {
    users.push({
      name: `Sim Provider ${i + 1}`,
      email: randomEmail(i),
      phone: randomPhone(i),
      password: "SimulatedPassword123!",
      role: "provider",
      isVerified: false,
      simSeeded: true,
    });

    if (i % 200 === 0) {
      console.log(`✅ Prepared ${i}/${SIM.counts.providers} users`);
    }
  }

  await User.insertMany(users);
  console.log(`🎉 Seeded ${users.length} users`);

  await mongoose.connection.close();
  process.exit(0);
}

seedUsers().catch(err => {
  console.error("❌ User seed error:", err);
  process.exit(1);
});
