import express from "express";
import { getFeed } from "../controllers/listingsFeedController.js";
import auth from "../middleware/auth.js";
const router = express.Router();

// GET /api/feed
router.get("/", authMiddleware, getFeed);

export default router;
