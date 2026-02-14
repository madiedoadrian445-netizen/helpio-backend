import express from "express";
import { getFeed } from "../controllers/listingsFeedController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// GET /api/feed
router.get("/", protect, getFeed);

export default router;
