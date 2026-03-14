import express from "express";
import Stripe from "stripe";

const router = express.Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

router.post("/create-verification-session", async (req, res) => {
  try {
    const session = await stripe.identity.verificationSessions.create({
      type: "document",
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