// src/middleware/upload.js
import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

/* -------------------------------------------------------
   Allowed MIME TYPES (strict server-side whitelist)
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
   Multer file filter — server-level image validation
-------------------------------------------------------- */
const fileFilter = (req, file, cb) => {
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(new Error("Invalid file type. Only images allowed."), false);
  }
  cb(null, true);
};

/* -------------------------------------------------------
   Cloudinary Storage (with safe filename generator)
-------------------------------------------------------- */
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: "helpio",
    format: file.mimetype.split("/")[1], // keeps original image format
    public_id: `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
    transformation: [
      { quality: "auto" },
      { fetch_format: "auto" }, // Cloudinary auto-optimization
    ],
  }),
});

/* -------------------------------------------------------
   Final Multer instance (hard limits)
-------------------------------------------------------- */
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
    files: 15,                 // Max per upload
  },
});
