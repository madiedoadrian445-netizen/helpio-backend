// cron/billingCron.js
import Subscription from "../models/Subscription.js";
import {
  stripeClient,
  isLiveStripe,
  isSimulatedStripe,
} from "../config/stripe.js";

import {
  reserveIdempotencyKey,
  markIdempotencyKeyCompleted,
  markIdempotencyKeyFailed,
} from "../utils/idempotency.js";

import {
  handleSuccessfulSubscriptionPayment,
  handleFailedSubscriptionPayment,
} from "../controllers/subscriptionController.js";

/* -------------------------------------------------------
   SAFE HELPERS
-------------------------------------------------------- */
const safeNum = (n) => {
  const v = parseFloat(n);
  return Number.isNaN(v) ? 0 : v;
};

const normalizeCurrency = (currency) => {
  if (!currency || typeof currency !== "string") return "usd";
  return currency.toLowerCase();
};

/* -------------------------------------------------------
   DETERMINISTIC IDEMPOTENCY KEY
   One billing cycle = one idempotency key
-------------------------------------------------------- */
const buildBillingKey = (subscription) => {
  const due = subscription.nextBillingDate || new Date();
  return `sub:${subscription._id.toString()}:next:${due.toISOString()}`;
};

/* -------------------------------------------------------
   Compute Next Billing Date from Plan
   (kept here in case you want cron-driven date logic later)
-------------------------------------------------------- */
const computeNextBillingDate = (currentDate, plan) => {
  const d = new Date(currentDate);

  if (plan.billingFrequency === "weekly") {
    d.setDate(d.getDate() + 7);
  } else if (plan.billingFrequency === "biweekly") {
    d.setDate(d.getDate() + 14);
  } else if (plan.billingFrequency === "monthly") {
    d.setMonth(d.getMonth() + 1);
  } else if (plan.billingFrequency === "custom" && plan.customInterval) {
    const { every, unit } = plan.customInterval;
    if (unit === "days") d.setDate(d.getDate() + every);
    if (unit === "weeks") d.setDate(d.getDate() + every * 7);
    if (unit === "months") d.setMonth(d.getMonth() + every);
  } else {
    d.setMonth(d.getMonth() + 1);
  }

  return d;
};

/* -------------------------------------------------------
   MAIN BILLING CRON — IDEMPOTENT, PRODUCTION SAFE
-------------------------------------------------------- */
export const runBillingCron = async () => {
  const now = new Date();
  console.log("🕒 Running Helpio Billing Cron at", now.toISOString());

  const subscriptions = await Subscription.find({
    status: { $in: ["active", "past_due"] },
    nextBillingDate: { $lte: now },
  })
    .populate("plan")
    .populate("client");

  if (!subscriptions.length) {
    console.log("ℹ️ No subscriptions due for billing.");
    return;
  }

  console.log(`🔎 Found ${subscriptions.length} subscription(s) due.\n`);

  for (const sub of subscriptions) {
    try {
      const plan = sub.plan;
      const client = sub.client;

      if (!plan || !client) {
        console.warn(`⚠️ Subscription ${sub._id} missing plan/client.`);
        continue;
      }

      if (!client.stripeCustomerId) {
        console.warn(`⚠️ Client missing stripeCustomerId for sub=${sub._id}`);
        continue;
      }

      /* ---------------------------------------------------
         1️⃣ TRIAL CHECK
      --------------------------------------------------- */
      if (sub.trialEndDate && sub.trialEndDate > now) {
        console.log(`⏳ Subscription ${sub._id} still in trial.`);
        continue;
      }

      /* ---------------------------------------------------
         2️⃣ MAX CYCLES CHECK
      --------------------------------------------------- */
      if (plan.maxCycles && sub.cycleCount >= plan.maxCycles) {
        sub.status = "canceled";
        sub.canceledAt = now;
        await sub.save();
        console.log(`🚫 Subscription ${sub._id} reached max cycles.`);
        continue;
      }

      /* ---------------------------------------------------
         3️⃣ PRICE
      --------------------------------------------------- */
      const amount = safeNum(sub.price || plan.price || 0);
      if (!amount) {
        console.warn(`⚠️ Subscription ${sub._id} has invalid price.`);
        continue;
      }

      const currency = normalizeCurrency(plan.currency || "usd");

      /* ---------------------------------------------------
         4️⃣ IDEMPOTENCY KEY
      --------------------------------------------------- */
      const idempotencyKey = buildBillingKey(sub);

      let idem;
      try {
        idem = await reserveIdempotencyKey({
          key: idempotencyKey,
          type: "subscription_charge",
          amount: Math.floor(amount * 100),
          currency,
          subscriptionId: sub._id,
          providerId: sub.provider,
          customerId: client._id,
          initiatedBy: "cron",
          payloadForHash: {
            subscriptionId: sub._id.toString(),
            amount,
            currency,
            nextBillingDate: (sub.nextBillingDate || now).toISOString(),
          },
          extraContext: { route: "runBillingCron" },
        });
      } catch (err) {
        console.error(
          `❌ Idempotency reserve failed for sub=${sub._id}: ${err.message}`
        );
        continue;
      }

      /* ---------------------------------------------------
         5️⃣ HANDLE EXISTING KEY STATES
      --------------------------------------------------- */
      if (idem.status === "existing_completed") {
        console.log(`🔁 Replayed: sub=${sub._id} already billed this cycle.`);
        continue;
      }

      if (idem.status === "existing_in_progress") {
        console.log(`⏳ Charge in progress for sub=${sub._id}, skipping.`);
        continue;
      }

      if (idem.status === "existing_failed") {
        console.log(
          `⚠️ Previous billing attempt failed for sub=${sub._id}, skipping.`
        );
        continue;
      }

      const idemId = idem.record._id;

      /* ---------------------------------------------------
         6️⃣ SIMULATED STRIPE
      --------------------------------------------------- */
      if (isSimulatedStripe || !stripeClient || !isLiveStripe) {
        try {
          const result = await handleSuccessfulSubscriptionPayment({
            subscriptionId: sub._id,
            amount,
            currency,
            method: "cron_simulated",
          });

          await markIdempotencyKeyCompleted(idemId, {
            stripePaymentIntentId: null,
            extraContext: { simulated: true },
          });

          console.log(
            `💳 (SIMULATED) Billed subscription sub=${sub._id} $${amount}`
          );
          continue;
        } catch (err) {
          await markIdempotencyKeyFailed(idemId, {
            extraContext: { error: err.message },
          });
          console.error(`❌ Simulated billing failed for ${sub._id}:`, err);
          continue;
        }
      }

      /* ---------------------------------------------------
         7️⃣ LIVE STRIPE CHARGE (Helpio Pay backend)
      --------------------------------------------------- */
      let paymentIntent;
      try {
        paymentIntent = await stripeClient.paymentIntents.create(
          {
            amount: Math.floor(amount * 100),
            currency,
            customer: client.stripeCustomerId,
            off_session: true,
            confirm: true,
            description: `Helpio Pay • Subscription`,
            metadata: {
              subscriptionId: String(sub._id),
              clientId: String(client._id),
              planId: String(plan._id),
              type: "subscription_charge_cron",
              brand: "Helpio Pay",
              source: "billing_cron",
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
        console.error(`❌ Stripe error for sub=${sub._id}:`, err);
        continue;
      }

      /* ---------------------------------------------------
         8️⃣ SUCCESSFUL PAYMENT
      --------------------------------------------------- */
      if (
        paymentIntent.status === "succeeded" ||
        paymentIntent.status === "requires_capture"
      ) {
        const result = await handleSuccessfulSubscriptionPayment({
          subscriptionId: sub._id,
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

        console.log(
          `✅ Billed subscription sub=${sub._id}, PI=${paymentIntent.id}`
        );

        continue;
      }

      /* ---------------------------------------------------
         9️⃣ PAYMENT FAILURE
      --------------------------------------------------- */
      await handleFailedSubscriptionPayment({
        subscriptionId: sub._id,
        amount,
        currency,
        method: "card_auto",
        stripePaymentIntentId: paymentIntent.id,
        failureReason: paymentIntent.status,
      });

      await markIdempotencyKeyFailed(idemId, {
        extraContext: { status: paymentIntent.status },
      });

      console.warn(
        `❌ Payment failed for sub=${sub._id}, status=${paymentIntent.status}`
      );
    } catch (err) {
      console.error(`❌ Unexpected Cron Error sub=${sub._id}:`, err);
    }
  }

  console.log("✅ Billing cron finished.\n");
};
