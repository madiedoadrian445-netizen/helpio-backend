import fs from "fs";
import path from "path";

export function loadListingImages(categorySlug, count = 5) {
  const BASE_URL = process.env.API_BASE_URL || "http://localhost:10000";

  // Absolute path to assets/seed-images
  const baseDir = path.resolve("assets/seed-images");
  const categoryDir = path.join(baseDir, categorySlug);

  // If category folder doesn't exist, return empty array safely
  if (!fs.existsSync(categoryDir)) {
    return [];
  }

  // Read valid image files
  const files = fs
    .readdirSync(categoryDir)
    .filter(file => /\.(jpg|jpeg|png|webp)$/i.test(file));

  if (!files.length) return [];

  // Shuffle images for randomness
  const shuffled = [...files].sort(() => 0.5 - Math.random());

  // Build FULL URLs that match Express static mount
 

return shuffled
  .slice(0, count)
  .map(file => `/seed-images/${categorySlug}/${file}`);


}
