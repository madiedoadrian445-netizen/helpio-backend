import mongoose from "mongoose";
import dotenv from "dotenv";
import Listing from "./src/models/Listing.js";

dotenv.config(); // 🔥 THIS loads .env variables

const DEFAULT_MIAMI = [-80.1918, 25.7617];

async function runMigration() {
  try {
   if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI is missing in .env");
}

await mongoose.connect(process.env.MONGODB_URI);

    console.log("✅ Connected to MongoDB");

    const result = await Listing.updateMany(
      {
        "location.coordinates": { $exists: false },
        "location.city": { $exists: true },
      },
      {
        $set: {
          "location.coordinates": {
            type: "Point",
            coordinates: DEFAULT_MIAMI,
          },
        },
      }
    );

    console.log("🔥 Listings fixed:", result.modifiedCount);

    await mongoose.disconnect();
    console.log("✅ Migration complete");
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  }
}

runMigration();
