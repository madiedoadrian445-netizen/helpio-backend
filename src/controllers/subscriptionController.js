// src/controllers/subscriptionController.js

// ---------------------------------------------------------
// IMPORTS
// ---------------------------------------------------------
import mongoose from "mongoose";

import SubscriptionPlan from "../models/SubscriptionPlan.js";
import Subscription from "../models/Subscription.js";
import SubscriptionCharge from "../models/SubscriptionCharge.js";
import Provider from "../models/Provider.js";
import Client from "../models/Client.js";
import { CustomerTimeline } from "../models/CustomerTimeline.js";
import LedgerEntry from "../models/LedgerEntry.js";

import {
  stripeClient,
  isLiveStripe,
  isSimulatedStripe,
} from "../config/stripe.js";

// IDEMPOTENCY SYSTEM
import {
  reserveIdempotencyKey,
  markIdempotencyKeyCompleted,
  markIdempotencyKeyFailed,
} from "../utils/idempotency.js";

// LEDGER ENGINE (Phase 2 subscriptions)
import { recordSubscriptionChargeLedger } from "../utils/ledger.js";

// Centralized fee engine (B19)
import { calculateFees } from "../utils/feeCalculator.js";

// ---------------------------------------------------------
// HELPERS
// ---------------------------------------------------------
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const safeNum = (n) => {
  const v = parseFloat(n);
  return Number.isNaN(v) ? 0 : v;
};

const sendError = (res, statusCode, message) =>
  res.status(statusCode).json({ success: false, message });

const normalizeCurrency = (currency) => {
  if (!currency || typeof currency !== "string") return "usd";
  return currency.toLowerCase();
};

const parsePositiveInt = (v, def, max) => {
  const n = parseInt(v, 10);
  if (Number.isNaN(n) || n <= 0) return def;
  return max && n > max ? max : n;
};

const getProviderForUser = async (userId) => {
  if (!userId) return null;
  // Only need _id for access control
  return Provider.findOne({ user: userId }).select("_id").lean();
};

// ---------------------------------------------------------
// DATE HELPER (billing frequency)
// ---------------------------------------------------------
const computeNextBillingDate = (fromDate, unit = "monthly") => {
  const base = fromDate ? new Date(fromDate) : new Date();
  const d = new Date(base);

  switch (unit) {
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "biweekly":
      d.setDate(d.getDate() + 14);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      break;
    case "monthly":
    default:
      d.setMonth(d.getMonth() + 1);
      break;
  }

  return d;
};

// ---------------------------------------------------------
// BILLING HELPERS (cron, manual charges, Tap to Pay)
// ---------------------------------------------------------

/**
 * Shared success handler for subscription payments
 * Used by:
 *  - Cron / auto-billing
 *  - Manual API billing (chargeSubscriptionNow)
 *  - Terminal flows
 */
export const handleSuccessfulSubscriptionPayment = async ({
  subscriptionId,
  amount,
  currency = "usd",
  method = "card_auto",
  stripePaymentIntentId = null,
}) => {
  if (!isValidId(subscriptionId)) return null;

  const sub = await Subscription.findById(subscriptionId)
    .populate("client")
    .populate("plan");

  if (!sub) return null;

  const plan = sub.plan;
  const providerId = sub.provider;
  const clientId = sub.client?._id || null;

  // Determine final charge amount
  const chargeAmount =
    safeNum(amount) || safeNum(sub.price) || safeNum(plan?.price);

  const planCurrency = plan?.currency || "usd";
  const finalCurrency = normalizeCurrency(currency || planCurrency);

  const freq = plan?.billingFrequency || "monthly";
  const baseDate = sub.nextBillingDate || new Date();
  const nextBillingDate = computeNextBillingDate(baseDate, freq);

  const externalPaymentId = stripePaymentIntentId || null;

  // Create SubscriptionCharge record
  const charge = await SubscriptionCharge.create({
    subscription: sub._id,
    plan: plan?._id,
    client: clientId,
    provider: providerId,
    amount: chargeAmount,
    currency: finalCurrency,
    status: "paid",
    method,
    externalPaymentId,
    failureReason: null,
  });

  // Update subscription snapshot
  sub.status = "active";
  sub.cycleCount = (sub.cycleCount || 0) + 1;
  sub.nextBillingDate = nextBillingDate;
  sub.lastChargeStatus = "success";
  if (externalPaymentId) {
    sub.stripeLatestPaymentIntent = externalPaymentId;
  }
  sub.lastBilledAt = new Date();
  await sub.save();

  // CRM Timeline
  if (clientId) {
    try {
      await CustomerTimeline.create({
        provider: providerId,
        customer: clientId,
        type: "subscription_charge",
        title: "Subscription charge succeeded",
        description: `Charged $${chargeAmount.toFixed(
          2
        )} for subscription`,
        amount: chargeAmount,
        subscription: sub._id,
        subscriptionCharge: charge._id,
      });
    } catch {
      // Non-fatal
    }
  }

  /* ⭐ B19 Fee Engine for subscription revenue */
  let ledgerResult = null;
  let feeMetadata = null;
  try {
    const grossCents = Math.floor(chargeAmount * 100);

    // Shared fee calculator (Stripe 2.9% + 30¢, Helpio 1%)
    const fees = calculateFees(grossCents);
    const stripeFeeCents = fees.processorFeeCents;
    const helpioFeeCents = fees.platformFeeCents;
    const totalFeeCents = fees.totalFeeCents;
    let netAmountCents = fees.netAmountCents;
    if (netAmountCents < 0) netAmountCents = 0;

    feeMetadata = {
      stripeFeeCents,
      helpioFeeCents,
      totalFeeCents,
      netAmountCents,
      grossAmountCents: grossCents,
      feeModel: "v1_helpio_1pct_stripe_2_9pct_30c",
    };

    ledgerResult = await recordSubscriptionChargeLedger({
      providerId,
      customerId: clientId,
      subscriptionId: sub._id,
      planId: plan?._id || null,
      stripePaymentIntentId: externalPaymentId,
      grossAmountCents: grossCents,
      feeAmountCents: totalFeeCents,
      netAmountCents,
      settlementDays: 7,
      trigger: method || "subscription_billing",
      metadata: {
        route: "handleSuccessfulSubscriptionPayment",
        method,
        subscriptionChargeId: charge._id,
        ...feeMetadata,
      },
    });
  } catch (err) {
    console.error("❌ Ledger error (subscription charge):", err.message);
    // Do NOT throw — subscription is successful even if ledger write fails.
  }

  const analytics = {
    type: "subscription_charge",
    processor: "helpio_pay",
    channel: method || "subscription_billing",
    subscriptionId: sub._id,
    providerId,
    customerId: clientId,
    currency: finalCurrency,
    amount: chargeAmount,
    amountCents: Math.floor(chargeAmount * 100),
    settlementDays: 7,
    fees: feeMetadata,
  };

  return {
    subscription: sub,
    charge,
    ledgerEntry: ledgerResult?.entry || null,
    providerBalance: ledgerResult?.balance || null,
    analytics,
  };
};

/**
 * Shared failure handler for subscription payments.
 * Used by:
 *  - Cron / auto-billing
 *  - chargeSubscriptionNow
 *  - Terminal flows when needed
 */
export const handleFailedSubscriptionPayment = async ({
  subscriptionId,
  amount,
  currency = "usd",
  method = "card_auto",
  stripePaymentIntentId = null,
  failureReason = "payment_failed",
}) => {
  if (!isValidId(subscriptionId)) return null;

  const sub = await Subscription.findById(subscriptionId)
    .populate("client")
    .populate("plan");

  if (!sub) return null;

  const providerId = sub.provider;
  const clientId = sub.client?._id || null;

  const chargeAmount =
    safeNum(amount) || safeNum(sub.price) || safeNum(sub.plan?.price);

  const finalCurrency = normalizeCurrency(currency);
  const externalPaymentId = stripePaymentIntentId || null;

  // Create failed SubscriptionCharge (for CRM + reporting)
  const charge = await SubscriptionCharge.create({
    subscription: sub._id,
    plan: sub.plan,
    client: clientId,
    provider: providerId,
    amount: chargeAmount,
    currency: finalCurrency,
    status: "failed",
    method,
    externalPaymentId,
    failureReason,
  });

  // Mark subscription as past_due but do NOT cancel
  sub.status = "past_due";
  sub.lastChargeStatus = "failed";
  sub.lastFailedAt = new Date();
  await sub.save();

  // CRM Timeline
  if (clientId) {
    try {
      await CustomerTimeline.create({
        provider: providerId,
        customer: clientId,
        type: "subscription_charge_failed",
        title: "Subscription charge failed",
        description: `Failed charge of $${chargeAmount.toFixed(
          2
        )} (${failureReason})`,
        amount: chargeAmount,
        subscription: sub._id,
        subscriptionCharge: charge._id,
      });
    } catch {
      // Non-fatal
    }
  }

  // ⭐ FAILED ledger entry (audit only, no balance impact)
  try {
    await LedgerEntry.create({
      provider: providerId,
      customer: clientId,
      type: "subscription_charge_failed",
      direction: "none",
      amount: Math.floor(chargeAmount * 100), // cents
      currency: finalCurrency,
      sourceType: "subscription",
      subscription: sub._id,
      stripePaymentIntentId: externalPaymentId || null,
      effectiveAt: new Date(),
      availableAt: new Date(),
      status: "failed",
      notes: failureReason || "Subscription charge failed",
      metadata: {
        brand: "Helpio Pay",
        type: "helpio_subscription_charge_failed",
        method,
        subscriptionChargeId: charge._id,
      },
      createdBy: "system",
    });
  } catch (e) {
    console.error("⚠️ Ledger failed-charge entry error:", e.message);
  }

  return { subscription: sub, charge };
};

// ---------------------------------------------------------
// CREATE SUBSCRIPTION
// ---------------------------------------------------------
export const createSubscription = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    if (!provider) {
      return sendError(res, 400, "Provider profile not found for this user.");
    }

    const { clientId, planId, startDate, overridePrice } = req.body;

    if (!clientId || !planId) {
      return sendError(res, 400, "clientId and planId are required.");
    }
    if (!isValidId(clientId) || !isValidId(planId)) {
      return sendError(res, 400, "Invalid clientId or planId.");
    }

    const client = await Client.findById(clientId).lean();
    if (!client) {
      return sendError(res, 404, "Client not found.");
    }

    const plan = await SubscriptionPlan.findById(planId).lean();
    if (!plan) {
      return sendError(res, 404, "Subscription plan not found.");
    }

    if (String(plan.provider) !== String(provider._id)) {
      return sendError(res, 403, "You do not own this subscription plan.");
    }

    const priceRaw =
      overridePrice != null && !Number.isNaN(Number(overridePrice))
        ? Number(overridePrice)
        : plan.price;

    const price = safeNum(priceRaw);
    if (!price || price < 0) {
      return sendError(res, 400, "Valid price could not be determined.");
    }

    const now = new Date();
    const start = startDate ? new Date(startDate) : now;

    let trialEndDate = null;
    let firstBillingDate = start;

    if (plan.hasTrial && plan.trial?.length && plan.trial?.unit) {
      trialEndDate = new Date(start);
      const len = plan.trial.length;

      if (plan.trial.unit === "days") {
        trialEndDate.setDate(trialEndDate.getDate() + len);
      } else if (plan.trial.unit === "weeks") {
        trialEndDate.setDate(trialEndDate.getDate() + len * 7);
      }

      firstBillingDate = trialEndDate;
    }

    if (!client.stripeCustomerId && !isSimulatedStripe) {
      return sendError(
        res,
        400,
        "Client does not have a Helpio Pay customer attached yet."
      );
    }

    const subscription = await Subscription.create({
      provider: provider._id,
      client: client._id,
      plan: plan._id,
      status: "active",
      price,
      startDate: start,
      nextBillingDate: firstBillingDate,
      cycleCount: 0,
      trialEndDate,
    });

    try {
      await CustomerTimeline.create({
        provider: provider._id,
        customer: client._id,
        type: "subscription_created",
        title: `Subscription to ${
          plan.planName || plan.name || "Plan"
        }`,
        description: `New subscription at $${price.toFixed(2)} / ${
          plan.billingFrequency || "monthly"
        }`,
        amount: price,
        subscription: subscription._id,
      });
    } catch {
      // Non-fatal
    }

    return res.status(201).json({
      success: true,
      subscription,
    });
  } catch (err) {
    console.error("❌ createSubscription error:", err);
    return sendError(res, 500, "Server error creating subscription.");
  }
};

// ---------------------------------------------------------
// GET ALL PROVIDER SUBSCRIPTIONS (Paginated + Filters)
// ---------------------------------------------------------
export const getMySubscriptions = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    if (!provider) {
      return sendError(res, 400, "Provider profile not found for this user.");
    }

    const {
      page = 1,
      limit = 20,
      status,
      clientId,
      planId,
      sort = "desc",
    } = req.query;

    const pageNum = parsePositiveInt(page, 1);
    const limitNum = parsePositiveInt(limit, 20, 100);
    const sortOrder = sort === "asc" ? 1 : -1;

    const filter = { provider: provider._id };

    if (status && typeof status === "string") {
      filter.status = status;
    }
    if (clientId && isValidId(clientId)) {
      filter.client = clientId;
    }
    if (planId && isValidId(planId)) {
      filter.plan = planId;
    }

    const [subscriptions, total] = await Promise.all([
      Subscription.find(filter)
        .populate("client", "name email phone stripeCustomerId")
        .populate("plan")
        .sort({ createdAt: sortOrder })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Subscription.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      subscriptions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (err) {
    console.error("❌ getMySubscriptions error:", err);
    return sendError(res, 500, "Server error fetching subscriptions.");
  }
};

// ---------------------------------------------------------
// GET SUBSCRIPTION BY ID
// ---------------------------------------------------------
export const getSubscriptionById = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    if (!provider) {
      return sendError(res, 400, "Provider profile not found for this user.");
    }

    const { id } = req.params;
    if (!isValidId(id)) {
      return sendError(res, 400, "Invalid subscription id.");
    }

    const subscription = await Subscription.findById(id)
      .populate("client", "name email phone stripeCustomerId")
      .populate("plan")
      .lean();

    if (!subscription) {
      return sendError(res, 404, "Subscription not found.");
    }

    if (String(subscription.provider) !== String(provider._id)) {
      return sendError(
        res,
        403,
        "You do not have access to this subscription."
      );
    }

    return res.json({
      success: true,
      subscription,
    });
  } catch (err) {
    console.error("❌ getSubscriptionById error:", err);
    return sendError(res, 500, "Server error fetching subscription.");
  }
};

// ---------------------------------------------------------
// PAUSE SUBSCRIPTION
// ---------------------------------------------------------
export const pauseSubscription = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    if (!provider) {
      return sendError(res, 400, "Provider profile not found for this user.");
    }

    const { id } = req.params;
    if (!isValidId(id)) {
      return sendError(res, 400, "Invalid subscription id.");
    }

    const subscription = await Subscription.findById(id);

    if (!subscription) {
      return sendError(res, 404, "Subscription not found.");
    }

    if (String(subscription.provider) !== String(provider._id)) {
      return sendError(
        res,
        403,
        "You do not have access to this subscription."
      );
    }

    if (subscription.status !== "active") {
      return sendError(res, 400, "Only active subscriptions can be paused.");
    }

    subscription.status = "paused";
    subscription.pauseInfo = {
      pausedAt: new Date(),
      resumeAt: null,
    };

    await subscription.save();

    return res.json({
      success: true,
      subscription,
    });
  } catch (err) {
    console.error("❌ pauseSubscription error:", err);
    return sendError(res, 500, "Server error pausing subscription.");
  }
};

// ---------------------------------------------------------
// RESUME SUBSCRIPTION
// ---------------------------------------------------------
export const resumeSubscription = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    if (!provider) {
      return sendError(res, 400, "Provider profile not found for this user.");
    }

    const { id } = req.params;
    if (!isValidId(id)) {
      return sendError(res, 400, "Invalid subscription id.");
    }

    const subscription = await Subscription.findById(id);

    if (!subscription) {
      return sendError(res, 404, "Subscription not found.");
    }

    if (String(subscription.provider) !== String(provider._id)) {
      return sendError(
        res,
        403,
        "You do not have access to this subscription."
      );
    }

    if (subscription.status !== "paused") {
      return sendError(res, 400, "Only paused subscriptions can be resumed.");
    }

    subscription.status = "active";
    subscription.pauseInfo = {
      pausedAt: null,
      resumeAt: null,
    };

    const now = new Date();

    if (!subscription.nextBillingDate || subscription.nextBillingDate < now) {
      subscription.nextBillingDate = now;
    }

    await subscription.save();

    return res.json({
      success: true,
      subscription,
    });
  } catch (err) {
    console.error("❌ resumeSubscription error:", err);
    return sendError(res, 500, "Server error resuming subscription.");
  }
};

// ---------------------------------------------------------
// CANCEL SUBSCRIPTION
// ---------------------------------------------------------
export const cancelSubscription = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    if (!provider) {
      return sendError(res, 400, "Provider profile not found for this user.");
    }

    const { id } = req.params;
    if (!isValidId(id)) {
      return sendError(res, 400, "Invalid subscription id.");
    }

    const subscription = await Subscription.findById(id);

    if (!subscription) {
      return sendError(res, 404, "Subscription not found.");
    }

    if (String(subscription.provider) !== String(provider._id)) {
      return sendError(
        res,
        403,
        "You do not have access to this subscription."
      );
    }

    if (subscription.status === "canceled") {
      return sendError(res, 400, "Subscription is already canceled.");
    }

    subscription.status = "canceled";
    subscription.canceledAt = new Date();

    await subscription.save();

    return res.json({
      success: true,
      subscription,
    });
  } catch (err) {
    console.error("❌ cancelSubscription error:", err);
    return sendError(res, 500, "Server error canceling subscription.");
  }
};

// ---------------------------------------------------------
// GET SUBSCRIPTION CHARGES (provider scoped, paginated)
// ---------------------------------------------------------
export const getSubscriptionCharges = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    if (!provider) {
      return sendError(res, 400, "Provider profile not found for this user.");
    }

    const { id } = req.params;
    if (!isValidId(id)) {
      return sendError(res, 400, "Invalid subscription id.");
    }

    const subscription = await Subscription.findById(id).lean();
    if (!subscription) {
      return sendError(res, 404, "Subscription not found.");
    }

    if (String(subscription.provider) !== String(provider._id)) {
      return sendError(
        res,
        403,
        "You do not have access to this subscription."
      );
    }

    const {
      page = 1,
      limit = 50,
      status,
      sort = "desc",
    } = req.query;

    const pageNum = parsePositiveInt(page, 1);
    const limitNum = parsePositiveInt(limit, 50, 200);
    const sortOrder = sort === "asc" ? 1 : -1;

    const filter = { subscription: subscription._id, provider: provider._id };
    if (status && typeof status === "string") {
      filter.status = status;
    }

    const [charges, total] = await Promise.all([
      SubscriptionCharge.find(filter)
        .sort({ createdAt: sortOrder })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      SubscriptionCharge.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      charges,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (err) {
    console.error("❌ getSubscriptionCharges error:", err);
    return sendError(res, 500, "Server error fetching charges.");
  }
};

// ---------------------------------------------------------
// CHARGE SUBSCRIPTION NOW — FULLY IDEMPOTENT
// ---------------------------------------------------------
export const chargeSubscriptionNow = async (req, res) => {
  try {
    const provider = await getProviderForUser(req.user?._id);
    if (!provider) {
      return sendError(res, 400, "Provider profile not found for this user.");
    }

    const { id } = req.params;
    const { idempotencyKey } = req.body;

    if (!isValidId(id)) {
      return sendError(res, 400, "Invalid subscription id.");
    }
    if (!idempotencyKey) {
      return sendError(
        res,
        400,
        "idempotencyKey is required for safe subscription charging."
      );
    }

    const subscription = await Subscription.findById(id)
      .populate("client")
      .populate("plan");

    if (!subscription) {
      return sendError(res, 404, "Subscription not found.");
    }

    if (String(subscription.provider) !== String(provider._id)) {
      return sendError(
        res,
        403,
        "You do not have access to this subscription."
      );
    }

    // Do not allow charging a canceled subscription
    if (subscription.status === "canceled") {
      return sendError(
        res,
        400,
        "Cannot charge a canceled subscription."
      );
    }

    // ❗ Hard rule: cannot charge before nextBillingDate
    const now = new Date();
    if (
      subscription.nextBillingDate &&
      new Date(subscription.nextBillingDate) > now
    ) {
      return sendError(
        res,
        400,
        "You cannot charge this subscription before its next scheduled billing date."
      );
    }

    const client = subscription.client;
    if (!client?.stripeCustomerId && !isSimulatedStripe) {
      return sendError(
        res,
        400,
        "Client is not yet enabled for Helpio Pay billing."
      );
    }

    const plan = subscription.plan;
    const amount = safeNum(subscription.price || plan?.price || 0);
    const currency = normalizeCurrency(plan?.currency || "usd");

    if (!amount || amount < 0) {
      return sendError(res, 400, "Invalid subscription amount.");
    }

    // ---------------------------
    // IDEMPOTENCY RESERVE
    // ---------------------------
    let idem;
    try {
      idem = await reserveIdempotencyKey({
        key: idempotencyKey,
        type: "subscription_charge",
        amount: Math.floor(amount * 100),
        currency,
        subscriptionId: subscription._id,
        providerId: provider._id,
        customerId: client._id,
        initiatedBy: "api",
        payloadForHash: {
          subscriptionId: subscription._id.toString(),
          amount,
          currency,
          providerId: provider._id.toString(),
          clientId: client._id.toString(),
        },
        extraContext: { route: "chargeSubscriptionNow" },
      });
    } catch (err) {
      return sendError(res, 400, err.message);
    }

    if (idem.status === "existing_completed") {
      return res.json({
        success: true,
        mode: "replayed",
        message: "Charge already completed.",
        paymentIntentId: idem.record.stripePaymentIntentId,
      });
    }

    if (idem.status === "existing_in_progress") {
      return sendError(
        res,
        409,
        "A charge with this idempotency key is already in progress."
      );
    }

    if (idem.status === "existing_failed") {
      return sendError(
        res,
        409,
        "A previous attempt with this idempotency key failed. Use a new key."
      );
    }

    const idemId = idem.record._id;

    // ---------------------------
    // SIMULATED MODE — no Stripe
    // ---------------------------
    if (isSimulatedStripe || !stripeClient || !isLiveStripe) {
      try {
        const result = await handleSuccessfulSubscriptionPayment({
          subscriptionId: subscription._id,
          amount,
          currency,
          method: "manual_simulated",
        });

        await markIdempotencyKeyCompleted(idemId, {
          stripePaymentIntentId: null,
          extraContext: { simulated: true },
        });

        const fallbackAnalytics = {
          type: "subscription_charge",
          processor: "helpio_pay",
          mode: "simulated",
          channel: "manual_simulated",
          subscriptionId: subscription._id,
          providerId: provider._id,
          customerId: client._id,
          currency,
          amount,
          amountCents: Math.floor(amount * 100),
        };

        return res.json({
          success: true,
          mode: "simulated",
          subscription: result?.subscription,
          ledgerEntry: result?.ledgerEntry || null,
          providerBalance: result?.providerBalance || null,
          analytics: result?.analytics || fallbackAnalytics,
        });
      } catch (err) {
        await markIdempotencyKeyFailed(idemId, {
          extraContext: { error: err.message },
        });
        console.error("❌ Simulated subscription charge error:", err);
        return sendError(
          res,
          500,
          "Server error charging subscription in simulated mode."
        );
      }
    }

    // ---------------------------
    // LIVE HELPio PAY PAYMENT (via Stripe backend)
    // ---------------------------
    let paymentIntent;
    try {
      paymentIntent = await stripeClient.paymentIntents.create(
        {
          amount: Math.floor(amount * 100),
          currency,
          customer: client.stripeCustomerId,
          off_session: true,
          confirm: true,
          description: "Helpio Pay • Subscription Charge",
          metadata: {
            subscriptionId: String(subscription._id),
            clientId: String(client._id),
            planId: String(plan._id),
            type: "helpio_subscription_charge_manual",
            source: "helpio_pay",
          },
        },
        {
          idempotencyKey,
        }
      );
    } catch (err) {
      await markIdempotencyKeyFailed(idemId, {
        extraContext: { stripeError: err.message, code: err.code },
      });
      console.error("❌ Stripe subscription PI error:", err);
      return sendError(
        res,
        500,
        "Helpio Pay was unable to create a subscription charge."
      );
    }

    // ---------------------------
    // SUCCESS
    // ---------------------------
    if (
      paymentIntent.status === "succeeded" ||
      paymentIntent.status === "requires_capture"
    ) {
      const result = await handleSuccessfulSubscriptionPayment({
        subscriptionId: subscription._id,
        amount,
        currency,
        method: "card_auto",
        stripePaymentIntentId: paymentIntent.id,
      });

      await markIdempotencyKeyCompleted(idemId, {
        stripePaymentIntentId: paymentIntent.id,
        stripeChargeId: paymentIntent.latest_charge || null,
        extraContext: { status: paymentIntent.status },
      });

      const baseAnalytics = result?.analytics || null;
      const analytics = baseAnalytics
        ? {
            ...baseAnalytics,
            mode: "live",
            processor: "helpio_pay",
            channel: "manual_subscription",
            paymentIntentId: paymentIntent.id,
            processorStatus: paymentIntent.status,
          }
        : {
            type: "subscription_charge",
            processor: "helpio_pay",
            mode: "live",
            channel: "manual_subscription",
            subscriptionId: subscription._id,
            providerId: provider._id,
            customerId: client._id,
            currency,
            amount,
            amountCents: Math.floor(amount * 100),
            paymentIntentId: paymentIntent.id,
            processorStatus: paymentIntent.status,
          };

      return res.json({
        success: true,
        mode: "live",
        subscription: result?.subscription,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        ledgerEntry: result?.ledgerEntry || null,
        providerBalance: result?.providerBalance || null,
        analytics,
      });
    }

    // ---------------------------
    // FAILURE
    // ---------------------------
    await handleFailedSubscriptionPayment({
      subscriptionId: subscription._id,
      amount,
      currency,
      method: "card_auto",
      stripePaymentIntentId: paymentIntent.id,
      failureReason: paymentIntent.status,
    });

    await markIdempotencyKeyFailed(idemId, {
      extraContext: { status: paymentIntent.status },
    });

    return res.status(402).json({
      success: false,
      mode: "live",
      message: "Helpio Pay was unable to complete this charge.",
      status: paymentIntent.status,
    });
  } catch (err) {
    console.error("❌ chargeSubscriptionNow error:", err);
    return sendError(
      res,
      500,
      "Server error charging subscription via Helpio Pay."
    );
  }
};
