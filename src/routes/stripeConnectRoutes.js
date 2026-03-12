import express from "express";
import {
  createConnectedAccount,
  createOnboardingLink
} from "../controllers/stripeConnectController.js";

const router = express.Router();

router.post("/connect/create-account", createConnectedAccount);
router.post("/connect/onboarding-link", createOnboardingLink);

export default router;