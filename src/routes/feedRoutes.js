import express from "express";
import { getFeed } from "../controllers/listingsFeedController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// GET /api/feed
router.get("/", authMiddleware, getFeed);

export default router;
