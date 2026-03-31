import express from "express";
import { getActivity } from "../controllers/activityController.js";
import requireAuth from "../middleware/requireAuth.js";

const router = express.Router();

router.get("/", requireAuth, getActivity);

export default router;