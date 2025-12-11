// config/stripe.js
import Stripe from "stripe";

/**
 * STRIPE CONFIGURATION
 * Supports:
 *  - Simulated Mode (no API calls)
 *  - Live Mode (real Stripe Terminal + PI)
 *
 * Required ENV:
 *  - STRIPE_SECRET_KEY   (only needed in live mode)
 *  - STRIPE_MODE         ("live" or "simulated")
 */

const stripeSecret = process.env.STRIPE_SECRET_KEY || null;
const stripeMode = (process.env.STRIPE_MODE || "simulated").toLowerCase();

// ----------------------------------------------------
// Stripe Client Initialization
// ----------------------------------------------------
let stripeClient = null;

if (stripeMode === "live") {
  if (!stripeSecret) {
    console.error("❌ STRIPE_MODE=live but STRIPE_SECRET_KEY is missing!");
  } else {
    try {
      stripeClient = new Stripe(stripeSecret, {
        apiVersion: "2024-06-20",
      });
      console.log("✅ Stripe client initialized (LIVE MODE)");
    } catch (err) {
      console.error("❌ Stripe initialization failed:", err.message);
    }
  }
} else {
  console.log("🧪 Stripe SIMULATED mode enabled (no real API calls)");
}

// ----------------------------------------------------
// Export Flags
// ----------------------------------------------------
export const STRIPE_MODE = stripeMode;

export const isLiveStripe = !!stripeClient && stripeMode === "live";
export const isSimulatedStripe = !isLiveStripe; // everything else is simulated

// ----------------------------------------------------
// Export Client
// ----------------------------------------------------
export { stripeClient };
