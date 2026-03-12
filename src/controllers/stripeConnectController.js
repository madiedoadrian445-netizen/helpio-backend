import { stripeClient, isSimulatedStripe } from "../config/stripe.js";
import Provider from "../models/Provider.js";

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


export const createOnboardingLink = async (req, res) => {
  try {

    const { providerId } = req.body;

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
        onboardingUrl: "https://helpio.dev/simulated-onboarding",
        simulated: true
      });
    }

    // -----------------------------
    // LIVE MODE
    // -----------------------------
    const accountLink = await stripeClient.accountLinks.create({
      account: provider.stripe_account_id,
      refresh_url: `${process.env.CLIENT_URL}/payouts/refresh`,
      return_url: `${process.env.CLIENT_URL}/payouts/success`,
      type: "account_onboarding"
    });

    res.json({
      success: true,
      onboardingUrl: accountLink.url
    });

  } catch (error) {

    console.error("Stripe onboarding error:", error);

    res.status(500).json({
      success: false,
      message: error.message
    });

  }
};