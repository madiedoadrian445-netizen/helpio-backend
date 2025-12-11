import express from "express";
import { protect } from "../middleware/auth.js";
import { getBalanceSummary } from "../controllers/balanceSummaryController.js";

const router = express.Router();

router.get("/summary", protect, getBalanceSummary);

export default router;
