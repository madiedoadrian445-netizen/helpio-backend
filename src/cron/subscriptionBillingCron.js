// src/cron/subscriptionBillingCron.js

import cron from "node-cron";
import mongoose from "mongoose";

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
   CONSTANTS
-------------------------------------------------------- */
const BATCH_LIMIT = 200; // max subscriptions processed per hourly run

/* -------------------------------------------------------
   HELPERS
-------------------------------------------------------- */
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const safeNum = (n) => {
  const v = parseFloat(n);
  return Number.isNaN(v) ? 0 : v;
};

const normalizeCurrency = (currency) => {
  if (!currency || typeof currency !== "string") return "usd";
  return currency.toLowerCase();
};

/**
 * Build a stable "run window" key per hour (UTC).
 * Example: 2025-12-09T14
 */
const getRunWindowKey = (date = new Date()) => {
  const d = new Date(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hour = String(d.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${day}T${hour}`;
};

/**
 * Idempotency key for cron-driven subscription billing.
 * One key per subscription per hour window.
 */
const buildCronIdempotencyKey = (subscriptionId, runWindowKey) =>
  `sub_cron_${subscriptionId}_${runWindowKey}`;

/* -------------------------------------------------------
   CORE: RUN ONE BILLING CYCLE (ONE HOURLY WINDOW)
-------------------------------------------------------- */

let isRunning = false; // in-process guard so cron doesn't overlap

export const runSubscriptionBillingOnce = async () => {
  if (isRunning) {
    console.warn("⏳ Subscription billing run already in progress. Skipping.");
    return;
  }

  isRunning = true;
  const startedAt = new Date();
  const runWindowKey = getRunWindowKey(startedAt);

  console.log(
    `🔁 [SubscriptionCron] Starting hourly run @ ${startedAt.toISOString()} (window=${runWindowKey})`
  );

  try {
    const now = new Date();

    // Find subscriptions that are due:
    //  - status: active or past_due
    //  - nextBillingDate <= now
    // NOTE: canceled/paused are excluded.
    const dueSubscriptions = await Subscription.find({
      status: { $in: ["active", "past_due"] },
      nextBillingDate: { $lte: now },
    })
      .populate("client")
      .populate("plan")
      .sort({ nextBillingDate: 1 })
      .limit(BATCH_LIMIT)
      .exec();

    if (!dueSubscriptions.length) {
      console.log(
        `✅ [SubscriptionCron] No due subscriptions in this window (${runWindowKey}).`
      );
      return;
    }

    console.log(
      `📌 [SubscriptionCron] Found ${dueSubscriptions.length} due subscriptions to process.`
    );

    let processed = 0;
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const sub of dueSubscriptions) {
      processed += 1;

      try {
        if (!isValidId(sub._id)) {
          console.warn(
            `⚠️ [SubscriptionCron] Invalid subscription id encountered: ${sub._id}`
          );
          skippedCount += 1;
          continue;
        }

        // Safety: never bill canceled or paused here (even if query missed).
        if (["canceled", "paused"].includes(sub.status)) {
          console.log(
            `↪️ [SubscriptionCron] Skipping subscription ${sub._id} (status=${sub.status}).`
          );
          skippedCount += 1;
          continue;
        }

        const client = sub.client;
        const plan = sub.plan;

        if (!plan) {
          console.warn(
            `⚠️ [SubscriptionCron] Subscription ${sub._id} has no attached plan. Skipping.`
          );
          skippedCount += 1;
          continue;
        }

        const amount = safeNum(sub.price || plan.price || 0);
        if (!amount || amount <= 0) {
          console.warn(
            `⚠️ [SubscriptionCron] Subscription ${sub._id} has invalid amount (${amount}). Skipping.`
          );
          skippedCount += 1;
          continue;
        }

        const currency = normalizeCurrency(plan.currency || "usd");

        const providerId = sub.provider;
        const clientId = client?._id || null;

        const idempotencyKey = buildCronIdempotencyKey(
          sub._id.toString(),
          runWindowKey
        );

        // ---------------------------
        // IDEMPOTENCY RESERVE
        // ---------------------------
        let idem;
        try {
          idem = await reserveIdempotencyKey({
            key: idempotencyKey,
            type: "subscription_charge_cron",
            amount: Math.floor(amount * 100),
            currency,
            subscriptionId: sub._id,
            providerId,
            customerId: clientId,
            initiatedBy: "cron",
            payloadForHash: {
              subscriptionId: sub._id.toString(),
              amount,
              currency,
              providerId: providerId?.toString?.() || null,
              clientId: clientId?.toString?.() || null,
              window: runWindowKey,
            },
            extraContext: { route: "subscription_cron_hourly" },
          });
        } catch (err) {
          console.error(
            `❌ [SubscriptionCron] Idempotency error for subscription ${sub._id}:`,
            err.message
          );
          failedCount += 1;
          continue;
        }

        if (idem.status === "existing_completed") {
          console.log(
            `🔁 [SubscriptionCron] Subscription ${sub._id} already billed for this window (replay).`
          );
          skippedCount += 1;
          continue;
        }

        if (idem.status === "existing_in_progress") {
          console.log(
            `⏳ [SubscriptionCron] Subscription ${sub._id} charge already in progress for this window.`
          );
          skippedCount += 1;
          continue;
        }

        if (idem.status === "existing_failed") {
          console.log(
            `🚫 [SubscriptionCron] Previous cron attempt failed for subscription ${sub._id} in this window.`
          );
          skippedCount += 1;
          continue;
        }

        const idemId = idem.record._id;

        // ---------------------------
        // SIMULATED MODE (no Stripe)
        // ---------------------------
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
              extraContext: {
                simulated: true,
                engine: "hourly_cron",
                window: runWindowKey,
              },
            });

            console.log(
              `✅ [SubscriptionCron] (SIMULATED) Charged subscription ${sub._id} for $${amount.toFixed(
                2
              )} ${currency}.`
            );
            successCount += 1;
            continue;
          } catch (err) {
            await markIdempotencyKeyFailed(idemId, {
              extraContext: { error: err.message, simulated: true },
            });
            console.error(
              `❌ [SubscriptionCron] Simulated charge failed for subscription ${sub._id}:`,
              err.message
            );
            failedCount += 1;
            continue;
          }
        }

        // ---------------------------
        // LIVE STRIPE MODE
        // ---------------------------

        if (!client?.stripeCustomerId) {
          console.warn(
            `⚠️ [SubscriptionCron] Client for subscription ${sub._id} has no stripeCustomerId. Marking as failed.`
          );

          await handleFailedSubscriptionPayment({
            subscriptionId: sub._id,
            amount,
            currency,
            method: "card_auto",
            stripePaymentIntentId: null,
            failureReason: "no_stripe_customer",
          });

          await markIdempotencyKeyFailed(idemId, {
            extraContext: {
              status: "no_stripe_customer",
              engine: "hourly_cron",
              window: runWindowKey,
            },
          });

          failedCount += 1;
          continue;
        }

        let paymentIntent;
        try {
          paymentIntent = await stripeClient.paymentIntents.create(
            {
              amount: Math.floor(amount * 100),
              currency,
              customer: client.stripeCustomerId,
              off_session: true,
              confirm: true,
              description: "Helpio Pay • Subscription Auto-Billing",
              metadata: {
                subscriptionId: String(sub._id),
                clientId: String(client._id),
                planId: String(plan._id),
                type: "helpio_subscription_charge_cron",
                source: "helpio_pay",
              },
            },
            {
              idempotencyKey,
            }
          );
        } catch (err) {
          await markIdempotencyKeyFailed(idemId, {
            extraContext: {
              stripeError: err.message,
              code: err.code,
              engine: "hourly_cron",
              window: runWindowKey,
            },
          });

          console.error(
            `❌ [SubscriptionCron] Stripe PI creation error for subscription ${sub._id}:`,
            err.message
          );

          await handleFailedSubscriptionPayment({
            subscriptionId: sub._id,
            amount,
            currency,
            method: "card_auto",
            stripePaymentIntentId: null,
            failureReason: err.code || "stripe_error",
          });

          failedCount += 1;
          continue;
        }

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
            extraContext: {
              status: paymentIntent.status,
              engine: "hourly_cron",
              window: runWindowKey,
            },
          });

          console.log(
            `✅ [SubscriptionCron] (LIVE) Charged subscription ${sub._id} for $${amount.toFixed(
              2
            )} ${currency} — PI=${paymentIntent.id}, status=${paymentIntent.status}`
          );

          successCount += 1;
        } else {
          await handleFailedSubscriptionPayment({
            subscriptionId: sub._id,
            amount,
            currency,
            method: "card_auto",
            stripePaymentIntentId: paymentIntent.id,
            failureReason: paymentIntent.status,
          });

          await markIdempotencyKeyFailed(idemId, {
            extraContext: {
              status: paymentIntent.status,
              engine: "hourly_cron",
              window: runWindowKey,
            },
          });

          console.warn(
            `🚫 [SubscriptionCron] PaymentIntent status=${paymentIntent.status} for subscription ${sub._id}. Marked as failed.`
          );
          failedCount += 1;
        }
      } catch (err) {
        console.error(
          `🔥 [SubscriptionCron] Unexpected error while processing subscription ${sub._id}:`,
          err
        );
        errorCount += 1;
      }
    }

    const endedAt = new Date();
    const ms = endedAt.getTime() - startedAt.getTime();

    console.log(
      `✅ [SubscriptionCron] Run complete (window=${runWindowKey}) | checked=${processed}, success=${successCount}, failed=${failedCount}, skipped=${skippedCount}, errors=${errorCount}, duration=${ms}ms`
    );
  } catch (err) {
    console.error("💥 [SubscriptionCron] Fatal error in cron run:", err);
  } finally {
    isRunning = false;
  }
};

/* -------------------------------------------------------
   CRON SCHEDULER
   Runs at minute 0 of every hour (UTC)
-------------------------------------------------------- */

let cronStarted = false;

// 🔹 Renamed to match server.js import: startSubscriptionBillingCron
export const startSubscriptionBillingCron = () => {
  if (cronStarted) {
    console.log("[SubscriptionCron] Cron already started. Skipping re-init.");
    return;
  }

  // “0 * * * *” → at minute 0 of every hour
  cron.schedule(
    "0 * * * *",
    async () => {
      await runSubscriptionBillingOnce();
    },
    {
      timezone: "UTC", // keep consistent with DB timestamps
    }
  );

  cronStarted = true;
  console.log(
    "🕒 [SubscriptionCron] Hourly subscription billing cron scheduled (runs at minute 0 of every hour, UTC)."
  );
};

export default startSubscriptionBillingCron;
