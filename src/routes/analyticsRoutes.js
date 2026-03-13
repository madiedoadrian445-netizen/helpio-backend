import express from "express";
import { protect } from "../middleware/auth.js";
import { getProviderAnalytics } from "../controllers/analyticsController.js";

const router = express.Router();

router.get("/", protect, getProviderAnalytics);

export default router;