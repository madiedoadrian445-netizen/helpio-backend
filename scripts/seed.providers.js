// scripts/seed.providers.js
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import User from "../src/models/User.js";
import Provider from "../src/models/Provider.js";
import { SIM, validateSimConfig } from "./sim.config.js";

// SAFETY
if (process.env.NODE_ENV === "production") {
  throw new Error("❌ Refusing to seed providers in production");
}

// HELPERS
function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function randInt(min, max) {
  return Math.floor(rand(min, max));
}

function pickWeighted(items, key = "pct") {
  const total = items.reduce((s, i) => s + i[key], 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item[key];
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function fakeBusinessName(i, category) {
  const names = [
    "Elite",
    "Prime",
    "Pro",
    "Express",
    "Quality",
    "Rapid",
    "Master",
    "Trusted",
  ];
  return `${names[randInt(0, names.length)]} ${category} ${i + 1}`;
}

function fakeEmail(i) {
  return `biz_${i}@helpio.dev`;
}

function fakePhone(i) {
  return `+1555${String(2000000 + i).slice(-7)}`;
}

async function seedProviders() {
  console.log("🏢 Seeding providers...");
  validateSimConfig();
  await connectDB();

  // Cleanup old simulated providers
  await Provider.deleteMany({ simSeeded: true });

 const users = await User.find({
  email: { $regex: /^sim_provider_/, $options: "i" }
}).limit(SIM.counts.providers);


  if (users.length === 0) {
    throw new Error("No simulated users found. Run seed.users.js first.");
  }

  for (let i = 0; i < users.length; i++) {
    const archetype = pickWeighted(SIM.providerArchetypes);
    const category =
      SIM.categories[randInt(0, SIM.categories.length)];

    const now = new Date();
    const honeymoonActive =
      Math.random() < SIM.honeymoon.activeHoneymoonPctAtStart / 100;

    const honeymoonStart = honeymoonActive
      ? new Date(now.getTime() - randInt(0, SIM.honeymoon.durationDays) * 86400000)
      : new Date(now.getTime() - randInt(10, 90) * 86400000);

    const honeymoonEnd = new Date(
      honeymoonStart.getTime() + SIM.honeymoon.durationDays * 86400000
    );

    await Provider.create({
      user: users[i]._id,
      businessName: fakeBusinessName(i, category),
      phone: fakePhone(i),
      email: fakeEmail(i),
      category,
      isVerified: Math.random() < archetype.isVerifiedChance,
      isSuspended: false,
      honeymoonStart,
      honeymoonEnd,
      simSeeded: true,
      simArchetype: archetype.key,
    });

    if (i % 200 === 0) {
      console.log(`✅ Created ${i}/${users.length} providers`);
    }
  }

  console.log("🎉 Providers seeded successfully");
  await mongoose.connection.close();
  process.exit(0);
}

seedProviders().catch((err) => {
  console.error("❌ Provider seed error:", err);
  process.exit(1);
});
