// src/services/helpioPay/terminalSimService.js
import crypto from "crypto";

/**
 * Simulated Helpio Pay terminal readers
 */
const simulatedReaders = [
  {
    id: "tmr_sim_helpio_front_counter",
    label: "Helpio Pay • Front Counter",
    device_type: "helpio_simulated_terminal",
    status: "online",
    simulated: true,
  },
  {
    id: "tmr_sim_helpio_mobile",
    label: "Helpio Pay • Mobile Tap",
    device_type: "helpio_simulated_tap",
    status: "online",
    simulated: true,
  },
];

/**
 * In-memory simulated PaymentIntent store.
 * NOTE: This is only for dev / test; real prod uses Stripe.
 */
const simulatedIntents = new Map();

/* -----------------------------
   Reader helpers
------------------------------ */
export const getSimulatedReaders = () => simulatedReaders;

export const findSimulatedReaderById = (readerId) =>
  simulatedReaders.find((r) => r.id === readerId) || null;

/* -----------------------------
   Intent helpers
------------------------------ */

export const createSimulatedIntent = ({
  prefix = "pi_helpio_sim",
  amountInCents,
  currency = "usd",
  captureMethod = "manual",
  description,
  invoiceId = null,
  subscriptionId = null,
  extra = {},
}) => {
  const id = `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
  const clientSecret = `${id}_secret_${crypto
    .randomBytes(8)
    .toString("hex")}`;

  const intent = {
    id,
    client_secret: clientSecret,
    status: "requires_payment_method",
    amount: amountInCents,
    currency,
    capture_method: captureMethod,
    description:
      description || "Helpio Pay • Tap to Pay (Simulated In-Person Charge)",
    invoiceId,
    subscriptionId,
    simulated: true,
    ...extra,
  };

  simulatedIntents.set(id, intent);
  return intent;
};

export const getSimulatedIntentById = (paymentIntentId) =>
  simulatedIntents.get(paymentIntentId) || null;

export const updateSimulatedIntentOnTap = (paymentIntentId) => {
  const intent = simulatedIntents.get(paymentIntentId);
  if (!intent) return null;

  intent.status =
    intent.capture_method === "manual" ? "requires_capture" : "succeeded";

  simulatedIntents.set(paymentIntentId, intent);
  return intent;
};

export const markSimulatedIntentCaptured = (paymentIntentId) => {
  const intent = simulatedIntents.get(paymentIntentId);
  if (!intent) return null;

  if (intent.capture_method === "manual") {
    intent.status = "succeeded";
    simulatedIntents.set(paymentIntentId, intent);
  }
  return intent;
};

export const hasSimulatedIntent = (paymentIntentId) =>
  simulatedIntents.has(paymentIntentId);

export const getSimulatedIntentStore = () => simulatedIntents;
