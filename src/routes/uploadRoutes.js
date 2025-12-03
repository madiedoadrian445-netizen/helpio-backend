// src/routes/uploadRoutes.js
import express from "express";
import { upload } from "../middleware/upload.js";
import { uploadImage, uploadImages } from "../controllers/uploadController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// Single image
router.post("/single", protect, upload.single("image"), uploadImage);

// Multiple images
router.post("/multiple", protect, upload.array("images", 15), uploadImages);

export default router;
