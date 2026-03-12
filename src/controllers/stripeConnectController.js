import { stripeClient, isSimulatedStripe } from "../config/stripe.js";
import Provider from "../models/providerModel.js";

export const createConnectedAccount = async (req, res) => {
  try {
    const { email, providerId } = req.body;

    const provider = await Provider.findById(providerId);

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: "Provider not found"
      });
    }

    // -----------------------------
    // SIMULATED MODE
    // -----------------------------
    if (isSimulatedStripe) {

      provider.stripe_account_id = "acct_simulated_" + providerId;
      await provider.save();

      return res.json({
        success: true,
        stripeAccountId: provider.stripe_account_id,
        simulated: true
      });
    }

    // -----------------------------
    // LIVE MODE
    // -----------------------------
    const account = await stripeClient.accounts.create({
      type: "express",
      country: "US",
      email,

      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true }
      },

      metadata: {
        providerId,
        platform: "Helpio Pay"
      }
    });

    provider.stripe_account_id = account.id;
    await provider.save();

    res.json({
      success: true,
      stripeAccountId: account.id
    });

  } catch (error) {

    console.error("Stripe Connect Error:", error);

    res.status(500).json({
      success: false,
      message: error.message
    });

  }
};