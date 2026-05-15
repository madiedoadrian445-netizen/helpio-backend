import express from "express";
import { getFeed } from "../controllers/listingsFeedController.js";
import { optionalAuth } from "../middleware/auth.js";

const router = express.Router();

// optionalAuth — authenticated users get personalised feed
// guests pass through and get a guest session feed
// feedLimiter is applied at server.js level on /api/feed
router.get("/", optionalAuth, getFeed);

export default router;