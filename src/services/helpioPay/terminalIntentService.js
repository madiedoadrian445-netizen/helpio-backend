// src/services/helpioPay/terminalIntentService.js
import mongoose from "mongoose";
import {
  stripeClient,
  isLiveStripe,
  isSimulatedStripe,
} from "../../config/stripe.js";

import Invoice from "../../models/Invoice.js";
import Subscription from "../../models/Subscription.js";
import Provider from "../../models/Provider.js";
import { CustomerTimeline } from "../../models/CustomerTimeline.js";

import {
  reserveIdempotencyKey,
  markIdempotencyKeyCompleted,
} from "../../utils/idempotency.js";

import {
  getSimulatedReaders,
  findSimulatedReaderById,
  createSimulatedIntent,
  getSimulatedIntentById,
  updateSimulatedIntentOnTap,
  hasSimulatedIntent,
} from "./terminalSimService.js";

import {
  buildGenericTerminalMetadata,
  buildInvoiceTerminalMetadata,
  buildSubscriptionTerminalMetadata,
} from "./terminalMetadata.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const safeNum = (n) => {
  const v = parseFloat(n);
  return Number.isNaN(v) ? 0 : v;
};

const normalizeCurrency = (currency) =>
  !currency || typeof currency !== "string" ? "usd" : currency.toLowerCase();

const sendErrorLike = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const getProviderForUserLean = async (userId) => {
  if (!userId) return null;
  return Provider.findOne({ user: userId }).select("_id").lean();
};

/* --------------------------------------------------
   LIVE / SIM READERS
-------------------------------------------------- */

export const doDiscoverReaders = async () => {
  if (isLiveStripe && stripeClient && !isSimulatedStripe) {
    const readers = await stripeClient.terminal.readers.list({ limit: 10 });
    const brandedReaders = readers.data.map((r) => ({
      id: r.id,
      label: "Helpio Pay Reader",
      status: r.status || "online",
      device_type: "helpio_terminal",
      live: true,
    }));

    return {
      mode: "live",
      readers: brandedReaders,
    };
  }

  return {
    mode: "simulated",
    readers: getSimulatedReaders(),
  };
};

export const doConnectReader = async (readerId) => {
  if (!readerId) throw sendErrorLike("readerId is required.", 400);

  if (isLiveStripe && stripeClient && !isSimulatedStripe) {
    return {
      mode: "live",
      message: "Helpio Pay terminal is managed directly on the device.",
      readerId,
    };
  }

  const reader = findSimulatedReaderById(readerId);
  if (!reader) throw sendErrorLike("Helpio Pay reader not found.", 404);

  return {
    mode: "simulated",
    reader: { ...reader, connected: true },
  };
};

/* --------------------------------------------------
   GENERIC TERMINAL PAYMENT INTENT
-------------------------------------------------- */

export const createGenericTerminalPaymentIntent = async ({
  amount,
  currency = "usd",
  invoiceId,
  subscriptionId,
  description,
  captureMethod = "manual",
  idempotencyKey,
}) => {
  const rawAmount = safeNum(amount);
  if (!rawAmount || rawAmount <= 0)
    throw sendErrorLike("Valid amount is required.", 400);

  if (!idempotencyKey)
    throw sendErrorLike("idempotencyKey is required.", 400);

  const finalCurrency = normalizeCurrency(currency);
  const amountInCents = Math.floor(rawAmount * 100);

  let idem;
  try {
    idem = await reserveIdempotencyKey({
      key: idempotencyKey,
      type: "terminal_charge",
      amount: amountInCents,
      currency: finalCurrency,
      initiatedBy: "helpio_terminal",
      payloadForHash: {
        invoiceId: invoiceId || null,
        subscriptionId: subscriptionId || null,
        amountInCents,
      },
      extraContext: { route: "createTerminalPaymentIntent" },
    });
  } catch (err) {
    throw sendErrorLike(err.message || "Idempotency error", 400);
  }

  if (idem.status === "existing_completed") {
    const piId = idem.record.stripePaymentIntentId;

    if (isLiveStripe && stripeClient && !isSimulatedStripe && piId) {
      const existingPi =
        (await stripeClient.paymentIntents.retrieve(piId).catch(() => null)) ||
        null;

      if (existingPi) {
        return {
          mode: "live",
          idempotencyReplayed: true,
          paymentIntent: {
            id: existingPi.id,
            client_secret: existingPi.client_secret,
            status: existingPi.status,
            amount: existingPi.amount,
            currency: existingPi.currency,
            metadata: existingPi.metadata,
          },
        };
      }
    }

    if (piId && hasSimulatedIntent(piId)) {
      return {
        mode: "simulated",
        idempotencyReplayed: true,
        paymentIntent: getSimulatedIntentById(piId),
      };
    }

    return {
      idempotencyReplayed: true,
      paymentIntentId: piId,
    };
  }

  if (idem.status === "existing_in_progress") {
    throw sendErrorLike(
      "A Helpio Pay terminal charge is already in progress.",
      409
    );
  }

  if (idem.status === "existing_failed") {
    throw sendErrorLike("Previous attempt failed. Use a new key.", 409);
  }

  const idemId = idem.record._id;

  /* ---------- SIMULATED ---------- */
  if (isSimulatedStripe || !stripeClient || !isLiveStripe) {
    const intent = createSimulatedIntent({
      amountInCents,
      currency: finalCurrency,
      captureMethod,
      description:
        description ||
        "Helpio Pay • Tap to Pay (In-Person Transaction, Simulated)",
      invoiceId: invoiceId || null,
      subscriptionId: subscriptionId || null,
    });

    await markIdempotencyKeyCompleted(idemId, {
      stripePaymentIntentId: intent.id,
      extraContext: { simulated: true },
    });

    return {
      mode: "simulated",
      paymentIntent: intent,
    };
  }

  /* ---------- LIVE ---------- */
  const metadata = buildGenericTerminalMetadata({
    invoiceId: invoiceId || "",
    subscriptionId: subscriptionId || "",
  });

  const paymentIntent = await stripeClient.paymentIntents.create(
    {
      amount: amountInCents,
      currency: finalCurrency,
      payment_method_types: ["card_present"],
      capture_method: captureMethod,
      description:
        description || "Helpio Pay • Tap to Pay (In-Person Transaction)",
      metadata,
    },
    { idempotencyKey }
  );

  await markIdempotencyKeyCompleted(idemId, {
    stripePaymentIntentId: paymentIntent.id,
    stripeChargeId: paymentIntent.latest_charge || null,
  });

  return {
    mode: "live",
    paymentIntent: {
      id: paymentIntent.id,
      client_secret: paymentIntent.client_secret,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      metadata: paymentIntent.metadata,
    },
  };
};

/* --------------------------------------------------
   INVOICE TERMINAL INTENT
-------------------------------------------------- */

export const createInvoiceTerminalIntent = async ({
  userId,
  invoiceId,
  currency = "usd",
  captureMethod = "manual",
  idempotencyKey,
}) => {
  if (!invoiceId || !isValidId(invoiceId)) {
    throw sendErrorLike("Valid invoiceId is required.", 400);
  }
  if (!idempotencyKey)
    throw sendErrorLike("idempotencyKey is required.", 400);

  let provider = null;
  if (userId) {
    provider = await getProviderForUserLean(userId);
    if (!provider) {
      throw sendErrorLike(
        "Provider profile not found for this user.",
        404
      );
    }
  }

  const invoiceQuery = { _id: invoiceId };
  if (provider?._id) {
    invoiceQuery.provider = provider._id;
  }

  const invoice = await Invoice.findOne(invoiceQuery)
    .populate("customer")
    .lean();

  if (!invoice) throw sendErrorLike("Invoice not found.", 404);

  const client = invoice.customer;
  if (!client) throw sendErrorLike("Invoice is missing a customer.", 400);

  const totalSafe = safeNum(invoice.total);
  const paidSafe = safeNum(invoice.paid);
  const balanceSafe = safeNum(invoice.balance);

  const outstanding =
    balanceSafe > 0 ? balanceSafe : Math.max(0, totalSafe - paidSafe);

  if (outstanding <= 0 || invoice.status === "PAID") {
    return {
      alreadyPaid: true,
      invoice,
    };
  }

  const grossCents = Math.floor(outstanding * 100);
  const finalCurrency = normalizeCurrency(currency);

  let idem;
  try {
    idem = await reserveIdempotencyKey({
      key: idempotencyKey,
      type: "terminal_invoice_charge",
      amount: grossCents,
      currency: finalCurrency,
      invoiceId: invoice._id,
      providerId: invoice.provider,
      customerId: client._id,
      initiatedBy: "helpio_terminal",
      payloadForHash: {
        invoiceId: invoice._id.toString(),
        providerId: invoice.provider.toString(),
        customerId: client._id.toString(),
        amount: grossCents,
        currency: finalCurrency,
      },
      extraContext: { route: "chargeInvoiceTerminal" },
    });
  } catch (err) {
    throw sendErrorLike(err.message || "Idempotency error", 400);
  }

  if (idem.status === "existing_completed") {
    const piId = idem.record.stripePaymentIntentId;

    if (isLiveStripe && stripeClient && !isSimulatedStripe && piId) {
      const existingPi =
        (await stripeClient.paymentIntents.retrieve(piId).catch(() => null)) ||
        null;

      if (existingPi) {
        return {
          mode: "live",
          idempotencyReplayed: true,
          paymentIntent: {
            id: existingPi.id,
            client_secret: existingPi.client_secret,
            status: existingPi.status,
            amount: existingPi.amount,
            currency: existingPi.currency,
            metadata: existingPi.metadata,
          },
          invoice,
        };
      }
    }

    if (piId && hasSimulatedIntent(piId)) {
      return {
        mode: "simulated",
        idempotencyReplayed: true,
        paymentIntent: getSimulatedIntentById(piId),
        invoice,
      };
    }

    return {
      idempotencyReplayed: true,
      paymentIntentId: piId,
      invoice,
    };
  }

  if (idem.status === "existing_in_progress") {
    throw sendErrorLike(
      "A Helpio Pay invoice terminal charge is already in progress.",
      409
    );
  }

  if (idem.status === "existing_failed") {
    throw sendErrorLike(
      "Previous Helpio Pay invoice charge attempt failed. Use a new key.",
      409
    );
  }

  const idemId = idem.record._id;

  /* ---------- SIMULATED ---------- */
  if (isSimulatedStripe || !stripeClient || !isLiveStripe) {
    const intent = createSimulatedIntent({
      prefix: "pi_helpio_invoice_sim",
      amountInCents: grossCents,
      currency: finalCurrency,
      captureMethod,
      description: "Helpio Pay • Invoice Tap to Pay (Simulated)",
      invoiceId: invoice._id.toString(),
      subscriptionId: null,
    });

    await markIdempotencyKeyCompleted(idemId, {
      stripePaymentIntentId: intent.id,
      extraContext: { simulated: true },
    });

    return {
      mode: "simulated",
      paymentIntent: intent,
      invoice,
    };
  }

  /* ---------- LIVE ---------- */
  const metadata = buildInvoiceTerminalMetadata({
    invoiceId: invoice._id,
    providerId: invoice.provider,
    customerId: client._id,
  });

  const paymentIntent = await stripeClient.paymentIntents.create(
    {
      amount: grossCents,
      currency: finalCurrency,
      payment_method_types: ["card_present"],
      capture_method: captureMethod,
      description: "Helpio Pay • Invoice Tap to Pay",
      metadata,
    },
    { idempotencyKey }
  );

  await markIdempotencyKeyCompleted(idemId, {
    stripePaymentIntentId: paymentIntent.id,
    stripeChargeId: paymentIntent.latest_charge || null,
  });

  return {
    mode: "live",
    paymentIntent: {
      id: paymentIntent.id,
      client_secret: paymentIntent.client_secret,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      metadata: paymentIntent.metadata,
    },
    invoice,
  };
};

/* --------------------------------------------------
   SUBSCRIPTION TERMINAL INTENT
-------------------------------------------------- */

export const createSubscriptionTerminalIntent = async ({
  userId,
  subscriptionId,
  captureMethod = "manual",
  idempotencyKey,
}) => {
  if (!subscriptionId || !isValidId(subscriptionId)) {
    throw sendErrorLike("Valid subscriptionId is required.", 400);
  }
  if (!idempotencyKey)
    throw sendErrorLike("idempotencyKey is required.", 400);

  const provider = await getProviderForUserLean(userId);
  if (!provider) {
    throw sendErrorLike(
      "Provider profile not found for this user.",
      404
    );
  }

  const subscription = await Subscription.findOne({
    _id: subscriptionId,
    provider: provider._id,
  })
    .populate("plan")
    .populate("client")
    .lean();

  if (!subscription) throw sendErrorLike("Subscription not found.", 404);

  const plan = subscription.plan;
  const client = subscription.client;

  if (!client) {
    throw sendErrorLike("Subscription is missing a client.", 400);
  }

  const amount = safeNum(subscription.price || plan?.price || 0);
  if (!amount || amount <= 0) {
    throw sendErrorLike("Subscription amount is invalid.", 400);
  }

  const finalCurrency = normalizeCurrency(plan?.currency || "usd");
  const grossCents = Math.floor(amount * 100);

  let idem;
  try {
    idem = await reserveIdempotencyKey({
      key: idempotencyKey,
      type: "terminal_subscription_charge",
      amount: grossCents,
      currency: finalCurrency,
      subscriptionId: subscription._id,
      providerId: provider._id,
      customerId: client._id,
      planId: plan?._id || null,
      initiatedBy: "helpio_terminal",
      payloadForHash: {
        subscriptionId: subscription._id.toString(),
        providerId: provider._id.toString(),
        customerId: client._id.toString(),
        planId: plan?._id?.toString() || null,
        amount: grossCents,
        currency: finalCurrency,
      },
      extraContext: { route: "chargeSubscriptionTerminal" },
    });
  } catch (err) {
    throw sendErrorLike(err.message || "Idempotency error", 400);
  }

  if (idem.status === "existing_completed") {
    const piId = idem.record.stripePaymentIntentId;

    if (isLiveStripe && stripeClient && !isSimulatedStripe && piId) {
      const existingPi =
        (await stripeClient.paymentIntents.retrieve(piId).catch(() => null)) ||
        null;

      if (existingPi) {
        return {
          mode: "live",
          idempotencyReplayed: true,
          paymentIntent: {
            id: existingPi.id,
            client_secret: existingPi.client_secret,
            status: existingPi.status,
            amount: existingPi.amount,
            currency: existingPi.currency,
            metadata: existingPi.metadata,
          },
          subscription,
        };
      }
    }

    if (piId && hasSimulatedIntent(piId)) {
      return {
        mode: "simulated",
        idempotencyReplayed: true,
        paymentIntent: getSimulatedIntentById(piId),
        subscription,
      };
    }

    return {
      idempotencyReplayed: true,
      paymentIntentId: piId,
      subscription,
    };
  }

  if (idem.status === "existing_in_progress") {
    throw sendErrorLike(
      "A Helpio Pay subscription terminal charge is already in progress.",
      409
    );
  }

  if (idem.status === "existing_failed") {
    throw sendErrorLike(
      "Previous Helpio Pay subscription charge attempt failed. Use a new key.",
      409
    );
  }

  const idemId = idem.record._id;

  /* ---------- SIMULATED ---------- */
  if (isSimulatedStripe || !stripeClient || !isLiveStripe) {
    const intent = createSimulatedIntent({
      prefix: "pi_helpio_sub_sim",
      amountInCents: grossCents,
      currency: finalCurrency,
      captureMethod,
      description: "Helpio Pay • Subscription Tap to Pay (Simulated)",
      invoiceId: null,
      subscriptionId: subscription._id.toString(),
    });

    await markIdempotencyKeyCompleted(idemId, {
      stripePaymentIntentId: intent.id,
      extraContext: { simulated: true },
    });

    return {
      mode: "simulated",
      paymentIntent: intent,
      subscription,
    };
  }

  /* ---------- LIVE ---------- */
  const metadata = buildSubscriptionTerminalMetadata({
    subscriptionId: subscription._id,
    providerId: provider._id,
    customerId: client._id,
    planId: plan?._id || null,
  });

  const paymentIntent = await stripeClient.paymentIntents.create(
    {
      amount: grossCents,
      currency: finalCurrency,
      payment_method_types: ["card_present"],
      capture_method: captureMethod,
      description: "Helpio Pay • Subscription Tap to Pay",
      metadata,
    },
    { idempotencyKey }
  );

  await markIdempotencyKeyCompleted(idemId, {
    stripePaymentIntentId: paymentIntent.id,
    stripeChargeId: paymentIntent.latest_charge || null,
  });

  return {
    mode: "live",
    paymentIntent: {
      id: paymentIntent.id,
      client_secret: paymentIntent.client_secret,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      metadata: paymentIntent.metadata,
    },
    subscription,
  };
};

/* --------------------------------------------------
   PROCESS SIMULATED TAP-TO-PAY
-------------------------------------------------- */
export const processSimulatedTapToPay = ({ paymentIntentId, readerId }) => {
  if (!paymentIntentId || !readerId) {
    throw sendErrorLike("Missing paymentIntentId or readerId.", 400);
  }

  // Live terminals: handled directly on device.
  if (isLiveStripe && stripeClient && !isSimulatedStripe) {
    return {
      mode: "live",
      message:
        "Tap-to-Pay is processed directly on the Helpio Pay terminal device.",
    };
  }

  const intent = getSimulatedIntentById(paymentIntentId);
  if (!intent) throw sendErrorLike("PaymentIntent not found.", 404);

  const reader = findSimulatedReaderById(readerId);
  if (!reader) throw sendErrorLike("Helpio Pay reader not found.", 404);

  const updatedIntent = updateSimulatedIntentOnTap(paymentIntentId);

  return {
    mode: "simulated",
    paymentIntent: updatedIntent,
    reader: { id: reader.id, label: reader.label },
  };
};
