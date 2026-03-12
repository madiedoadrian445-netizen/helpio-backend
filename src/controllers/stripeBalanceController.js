import { stripeClient, isSimulatedStripe } from "../config/stripe.js";
import Provider from "../models/Provider.js";

export const getProviderBalance = async (req, res) => {
  try {

    const { providerId } = req.params;

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
        balance: {
          available: 1240,
          pending: 320,
          currency: "usd"
        },
        simulated: true
      });
    }

    // -----------------------------
    // LIVE MODE
    // -----------------------------
    const balance = await stripeClient.balance.retrieve({
      stripeAccount: provider.stripe_account_id
    });

    const available = balance.available[0]?.amount || 0;
    const pending = balance.pending[0]?.amount || 0;

    res.json({
      success: true,
      balance: {
        available: available / 100,
        pending: pending / 100,
        currency: "usd"
      }
    });

  } catch (error) {

    console.error("Stripe balance error:", error);

    res.status(500).json({
      success: false,
      message: error.message
    });

  }
};