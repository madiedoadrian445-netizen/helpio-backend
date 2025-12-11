// src/config/cloudinary.js
import { v2 as cloudinary } from "cloudinary";

/* -------------------------------------------------------
   Validate required environment variables
-------------------------------------------------------- */
const requiredEnvVars = [
  "CLOUDINARY_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];

requiredEnvVars.forEach((key) => {
  if (!process.env[key]) {
    console.error(`❌ Missing Cloudinary ENV variable: ${key}`);
    throw new Error(`Cloudinary configuration failed: ${key} is not defined`);
  }
});

/* -------------------------------------------------------
   Secure Cloudinary configuration
-------------------------------------------------------- */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME.trim(),
  api_key: process.env.CLOUDINARY_API_KEY.trim(),
  api_secret: process.env.CLOUDINARY_API_SECRET.trim(),
  secure: true, // forces HTTPS for all image URLs
});

/* -------------------------------------------------------
   OPTIONAL SAFE WRAPPERS
   These make your future image features safer and easier
-------------------------------------------------------- */

export const uploadToCloudinary = async (filePath, folder = "helpio") => {
  try {
    return await cloudinary.uploader.upload(filePath, {
      folder,
      resource_type: "image",
      transformation: [{ quality: "auto" }, { fetch_format: "auto" }],
    });
  } catch (err) {
    console.error("🔥 Cloudinary Upload Error:", err.message);
    throw new Error("Cloudinary upload failed");
  }
};

export const deleteFromCloudinary = async (publicId) => {
  try {
    return await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error("🔥 Cloudinary Delete Error:", err.message);
    throw new Error("Cloudinary delete failed");
  }
};

export default cloudinary;
