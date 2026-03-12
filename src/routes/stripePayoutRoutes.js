import express from "express";
import { createPayout } from "../controllers/stripePayoutController.js";

const router = express.Router();

router.post("/payout", createPayout);

export default router;