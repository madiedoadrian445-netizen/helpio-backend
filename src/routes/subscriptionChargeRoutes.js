// routes/subscriptionChargeRoutes.js
import express from "express";
import { protect } from "../middleware/auth.js";
import {
  getChargesForProvider,
  getChargesForSubscription,
  getChargesForClient,
  getChargesForPlan,
} from "../controllers/subscriptionChargeController.js";

const router = express.Router();

/* ----------------------------------------
   SUBSCRIPTION CHARGE / RECEIPTS ROUTES
   (All provider-scoped, authenticated)
------------------------------------------*/

// Global receipts for this provider
router.get("/me", protect, getChargesForProvider);

// Charges for a single subscription
router.get("/subscription/:id", protect, getChargesForSubscription);

// Charges for a specific client (CRM → billing history)
router.get("/client/:id", protect, getChargesForClient);

// Charges for a specific plan (plan detail screen)
router.get("/plan/:id", protect, getChargesForPlan);

export default router;
