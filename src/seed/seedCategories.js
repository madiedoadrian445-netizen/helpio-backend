import dotenv from "dotenv";
import { connectDB } from "../config/db.js";
import Category from "../models/Category.js";

dotenv.config();

const categories = [
  { name: "Mobile Detailing", slug: "mobile-detailing" },
  { name: "Barbershops", slug: "barbershops" },
  { name: "Mechanic Shops", slug: "mechanic-shops" },
  { name: "Home Renovation", slug: "home-renovation" },
  { name: "Plumbing", slug: "plumbing" },
  { name: "Electrical", slug: "electrical" },
  { name: "Landscaping", slug: "landscaping" },
  { name: "Pool Cleaning", slug: "pool-cleaning" },
  { name: "HVAC", slug: "hvac" },
  { name: "Moving Services", slug: "moving-services" },
  { name: "Marine", slug: "marine" },
  { name: "Professional Services", slug: "professional-services" },
  { name: "Beauty & Wellness", slug: "beauty-wellness" },
  { name: "Automotive", slug: "automotive" },
  { name: "Tech & IT", slug: "tech-it" },
  { name: "Events", slug: "events" },
  { name: "Education", slug: "education" },
  { name: "Photography", slug: "photography" },
  { name: "Music Production", slug: "music-production" },
  { name: "Recording Studio", slug: "recording-studio" },
];

const seed = async () => {
  try {
    await connectDB();
    await Category.deleteMany();
    await Category.insertMany(categories);
    console.log("✅ Categories seeded successfully");
    process.exit();
  } catch (err) {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
  }
};

seed();