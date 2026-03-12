import express from "express";
import { getProviderBalance } from "../controllers/stripeBalanceController.js";

const router = express.Router();

router.get("/balance/:providerId", getProviderBalance);

export default router;