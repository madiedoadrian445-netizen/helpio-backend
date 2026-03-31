import express from "express";
import { getActivity } from "../controllers/activityController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.get("/", protect, getActivity);

export default router;