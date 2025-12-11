import express from "express";
import { protect } from "../middleware/auth.js";
import { getBalanceHistory } from "../controllers/balanceHistoryController.js";

const router = express.Router();

router.get("/history", protect, getBalanceHistory);

export default router;
