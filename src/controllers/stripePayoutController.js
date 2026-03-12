import { stripeClient, isSimulatedStripe } from "../config/stripe.js";
import Provider from "../models/Provider.js";

export const createPayout = async (req, res) => {
  try {

    const { providerId, amount } = req.body;

    const provider = await Provider.findById(providerId);

    if (!provider || !provider.stripe_account_id) {
      return res.status(400).json({
        success: false,
        message: "Provider Stripe account not found"
      });
    }

    // -----------------------------
    // SIMULATED MODE
    // -----------------------------
    if (isSimulatedStripe) {
      return res.json({
        success: true,
        payout: {
          amount,
          currency: "usd",
          status: "paid"
        },
        simulated: true
      });
    }

    // -----------------------------
    // LIVE MODE
    // -----------------------------
    const payout = await stripeClient.payouts.create(
      {
        amount: amount * 100,
        currency: "usd"
      },
      {
        stripeAccount: provider.stripe_account_id
      }
    );

    res.json({
      success: true,
      payout
    });

  } catch (error) {

    console.error("Stripe payout error:", error);

    res.status(500).json({
      success: false,
      message: error.message
    });

  }
};