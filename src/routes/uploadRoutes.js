// src/routes/uploadRoutes.js
import express from "express";
import { protect } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js"; // 🔥 USE CLOUDINARY STORAGE
import {
  uploadImage,
  uploadImages,
  deleteImage,
} from "../controllers/uploadController.js";

const router = express.Router();

/* -------------------------------------------------------
   Allowed MIME types for images ONLY
-------------------------------------------------------- */
const allowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
  "image/heic",
  "image/heif",
];

/* -------------------------------------------------------
   Multer FILE FILTER (runs BEFORE Cloudinary)
-------------------------------------------------------- */
const fileFilter = (req, file, cb) => {
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(new Error("Invalid file type. Only image files allowed."), false);
  }
  cb(null, true);
};

/* -------------------------------------------------------
   Apply extra Multer config with Cloudinary storage
-------------------------------------------------------- */
const uploader = upload; // alias for clarity
uploader.fileFilter = fileFilter;

/* -------------------------------------------------------
   ROUTES
-------------------------------------------------------- */

// ⭐ Single image upload (field: "image")
router.post(
  "/single",
  protect,
  uploader.single("image"),
  uploadImage
);

// ⭐ Multiple images upload (field: "images")
router.post(
  "/",
  protect,
  uploader.array("files", 15), // ✅ MUST MATCH FRONTEND
  uploadImages
);

// ⭐ SECURE DELETE IMAGE (Cloudinary + Listing Cleanup)
router.delete(
  "/image",
  protect,
  deleteImage
);

export default router;
