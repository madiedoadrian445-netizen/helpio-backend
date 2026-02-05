// scripts/seed.listings.js
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/config/db.js";
import Provider from "../src/models/Provider.js";
import { Listing } from "../src/models/Listing.js";
import { SIM } from "./sim.config.js";
import { loadListingImages } from "../src/utils/loadListingImages.js";

// SAFETY
if (process.env.NODE_ENV === "production") {
  throw new Error("❌ Refusing to seed listings in production");
}

// HELPERS
function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function randInt(min, max) {
  return Math.floor(rand(min, max));
}

function randomPrice(category) {
  const ranges = {
    plumbing: [75, 350],
    mobileMechanic: [100, 500],
    detailing: [60, 250],
    cleaning: [80, 300],
    handyman: [60, 200],
    barber: [25, 100],
    moving: [150, 800],
    electronicsRepair: [50, 300],
  };
  const [min, max] = ranges[category] || [50, 300];
  return Math.round(rand(min, max));
}

function fakeTitle(category) {
  const titles = {
    plumbing: "Professional Plumbing Service",
    mobileMechanic: "Mobile Mechanic – On-Site Repair",
    detailing: "Premium Auto Detailing",
    cleaning: "Home & Office Cleaning",
    handyman: "Trusted Handyman Services",
    barber: "Mobile Barber – Fresh Cuts",
    moving: "Reliable Moving Service",
    electronicsRepair: "Electronics Repair Service",
  };
  return titles[category] || "Professional Service";
}

function fakeDescription(category) {
  return `High-quality ${category} services provided by experienced professionals. Fast response times, fair pricing, and customer satisfaction guaranteed.`;
}

// MAIN
async function seedListings() {
  console.log("📦 Seeding listings...");
  await connectDB();

  // Clean old simulated listings
  const providerIds = await Provider.find({ simSeeded: true }).distinct("_id");
  await Listing.deleteMany({ provider: { $in: providerIds } });

  const providers = await Provider.find({ simSeeded: true });

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    const listingCount = randInt(1, 4); // 1–3 listings per provider

    for (let j = 0; j < listingCount; j++) {
      const category =
        provider.category ||
        SIM.categories[randInt(0, SIM.categories.length)];

      const imgs = loadListingImages(category);

      await Listing.create({
        provider: provider._id,
        businessName: provider.businessName,
        title: fakeTitle(category),
        description: fakeDescription(category),
        price: randomPrice(category),
        category,

        images: imgs, // ✅ schema source of truth
        photos: imgs, // ✅ frontend compatibility

        isActive: true,
      });
    }

    if (i % 200 === 0) {
      console.log(`✅ Listings for ${i}/${providers.length} providers`);
    }
  }

  console.log("🎉 Listings seeded successfully");
  await mongoose.connection.close();
  process.exit(0);
}

seedListings().catch((err) => {
  console.error("❌ Listing seed error:", err);
  process.exit(1);
});
