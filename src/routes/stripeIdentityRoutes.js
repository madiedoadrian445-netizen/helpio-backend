import express from "express";
import Stripe from "stripe";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

router.post("/create-verification-session", protect, async (req, res) => {
  try {
    const providerId = req.user._id;

    const session = await stripe.identity.verificationSessions.create({
      type: "document",
      metadata: {
        providerId: providerId.toString(),
      },
      options: {
        document: {
          require_live_capture: true,
          require_matching_selfie: true,
        },
      },
    });

    res.json({
      clientSecret: session.client_secret,
    });

  } catch (error) {
    console.error("Stripe Identity error:", error);
    res.status(500).json({ error: "Failed to create verification session" });
  }
});

export default router;