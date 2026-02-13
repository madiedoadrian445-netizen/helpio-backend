// src/controllers/uploadController.js
import { deleteFromCloudinary } from "../config/cloudinary.js";
import Listing from "../models/Listing.js";


/* -------------------------------------------------------
   SINGLE IMAGE UPLOAD
   Multer stores file → return clean URL
-------------------------------------------------------- */
export const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file received",
      });
    }

    const { mimetype, size, path: filePath } = req.file;

    // Allowed MIME types
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/jpg",
      "image/heic",
      "image/heif",
    ];

    if (!allowedTypes.includes(mimetype)) {
      return res.status(400).json({
        success: false,
        message: "Invalid file type. Only JPEG, PNG, WEBP, HEIC allowed.",
      });
    }

    // Max size 5MB
    const MAX_SIZE = 5 * 1024 * 1024;
    if (size > MAX_SIZE) {
      return res.status(400).json({
        success: false,
        message: "File too large. Maximum size is 5MB.",
      });
    }

    return res.json({
      success: true,
      url: filePath, // Multer Cloudinary adapter returns final URL here
    });

  } catch (err) {
    console.error("🔥 Upload Error:", err);
    return res.status(500).json({
      success: false,
      message: "Upload failed",
    });
  }
};


/* -------------------------------------------------------
   MULTIPLE IMAGE UPLOAD (Array)
-------------------------------------------------------- */
export const uploadImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No files received",
      });
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/jpg",
      "image/heic",
      "image/heif",
    ];

    const MAX_SIZE = 5 * 1024 * 1024;
    const urls = [];

    for (const file of req.files) {
      const { mimetype, size, path: filePath } = file;

      if (!allowedTypes.includes(mimetype)) {
        return res.status(400).json({
          success: false,
          message: `Invalid file type (${mimetype}). Only images allowed.`,
        });
      }

      if (size > MAX_SIZE) {
        return res.status(400).json({
          success: false,
          message: `File too large (${file.originalname}). Max 5MB.`,
        });
      }

      urls.push(filePath);
    }

    return res.json({
      success: true,
      urls,
    });

  } catch (err) {
    console.error("🔥 Upload Error:", err);
    return res.status(500).json({
      success: false,
      message: "Upload failed",
    });
  }
};


/* -------------------------------------------------------
   DELETE IMAGE (Provider-Secured)
   Body:
     - imageUrl   (required)
     - listingId  (optional)
-------------------------------------------------------- */
export const deleteImage = async (req, res) => {
  try {
    const { imageUrl, listingId } = req.body;

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        message: "Image URL is required",
      });
    }

    /* -----------------------------------------------------
       Extract Cloudinary public_id from URL
       Example:
       https://res.cloudinary.com/.../helpio/17000000-12345.png
    ------------------------------------------------------ */
    const parts = imageUrl.split("/");
    const filename = parts[parts.length - 1];
    const folder = parts[parts.length - 2];

    if (!filename || !folder) {
      return res.status(400).json({
        success: false,
        message: "Invalid Cloudinary image URL format",
      });
    }

    const publicId = `${folder}/${filename.replace(/\.[^/.]+$/, "")}`;

    /* -----------------------------------------------------
       Validate provider ownership if listingId was provided
    ------------------------------------------------------ */
    if (listingId) {
      const listing = await Listing.findById(listingId);

      if (!listing) {
        return res.status(404).json({
          success: false,
          message: "Listing not found",
        });
      }

      // PROVIDER SECURITY FIX — correct comparison
      if (String(listing.provider) !== String(req.user.provider)) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to delete images from this listing",
        });
      }

      // Remove deleted image from the listing document
      listing.images = listing.images.filter((img) => img !== imageUrl);
      await listing.save();
    }

    /* -----------------------------------------------------
       Delete from Cloudinary
    ------------------------------------------------------ */
    const cloudinaryResponse = await deleteFromCloudinary(publicId);

    return res.json({
      success: true,
      message: "Image deleted successfully",
      cloudinary: cloudinaryResponse,
    });

  } catch (err) {
    console.error("🔥 DELETE IMAGE ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Image deletion failed",
    });
  }
};
