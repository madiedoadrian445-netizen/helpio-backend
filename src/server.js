// src/server.js
import "dotenv/config";
import express from "express";
import morgan from "morgan";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import xss from "xss-clean";
import rateLimit from "express-rate-limit";
import cron from "node-cron";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { runAutoPayoutCron } from "./cron/autoPayoutCron.js";
import { stripeWebhookHandler } from "./controllers/stripeWebhookController.js";
import balanceHistoryRoutes from "./routes/balanceHistoryRoutes.js";
import balanceSummaryRoutes from "./routes/balanceSummaryRoutes.js";
import adminRevenueRoutes from "./routes/adminRevenueRoutes.js";
import adminFraudRoutes from "./routes/adminFraudRoutes.js";
import adminDashboardRoutes from "./routes/adminDashboardRoutes.js";
import adminAuthSecurityRoutes from "./routes/adminAuthSecurityRoutes.js";
import adminSuspiciousRoutes from "./routes/adminSuspiciousRoutes.js";
import terminalPaymentSimRoutes from "./routes/terminalPaymentSimRoutes.js";

console.log("🔑 JWT_SECRET:", process.env.JWT_SECRET);


/* ❗ FIXED PATH */
import idempotencyRoutes from "./routes/idempotencyRoutes.js";
import adminPayoutRoutes from "./routes/adminPayoutRoutes.js";

import { connectDB } from "./config/db.js";
import { notFound, errorHandler } from "./middleware/errorMiddleware.js";

import { logInfo } from "./utils/logger.js";
import { startSubscriptionBillingCron } from "./cron/subscriptionBillingCron.js";
import { nightlyBalanceRecalculation } from "./cron/recalculateBalancesCron.js";

/* ⭐ NEW — STRICT Helpio Pay limiter */
import { helpioPayLimiter } from "./middleware/helpioPayLimiter.js";

/* -------------------- Import Routes -------------------- */
import authRoutes from "./routes/auth.routes.js";
import providerRoutes from "./routes/providerRoutes.js";
import listingRoutes from "./routes/listingRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import customerRoutes from "./routes/customerRoutes.js";
import customerTimelineRoutes from "./routes/customerTimelineRoutes.js";
import invoiceRoutes from "./routes/invoiceRoutes.js";
import subscriptionPlanRoutes from "./routes/subscriptionPlanRoutes.js";
import subscriptionRoutes from "./routes/subscriptionRoutes.js";
import subscriptionChargeRoutes from "./routes/subscriptionChargeRoutes.js";
import terminalRoutes from "./routes/terminalRoutes.js";
import refundRoutes from "./routes/refundRoutes.js";
import ledgerRoutes from "./routes/ledgerRoutes.js";
import disputeRoutes from "./routes/disputeRoutes.js";
import payoutRoutes from "./routes/payoutRoutes.js";
import terminalPaymentRoutes from "./routes/terminalPaymentRoutes.js";
import providerPayoutDashboardRoutes from "./routes/providerPayoutDashboardRoutes.js";
import financialStatementRoutes from "./routes/financialStatementRoutes.js";
import { runMonthlyStatementsCron } from "./cron/monthlyStatementsCron.js";
import adminTaxRoutes from "./routes/adminTaxRoutes.js";
import adminProviderFinancialRoutes from "./routes/adminProviderFinancialRoutes.js";

/* ⭐ NEW — Admin Ledger Audit Routes */
import adminLedgerRoutes from "./routes/adminLedgerRoutes.js";

/* ⭐ NEW — FULL ADMIN CRON SUITE */
import adminCronRoutes from "./routes/adminCronRoutes.js";

/* -------------------- Initialize App -------------------- */
const app = express();

/* ⭐ Security: hide tech stack */
app.disable("x-powered-by");

/* ---------------------------------------------------------
   TRUST PROXY (Required for Stripe Terminal + CF + Render)
---------------------------------------------------------- */
// Trust ONLY the first proxy (Render / CF)
app.set("trust proxy", 1);


/* ---------------------------------------------------------
   ⭐ STRIPE WEBHOOK — MUST COME BEFORE express.json()
---------------------------------------------------------- */
app.post(
  "/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (req, res, next) => {
    try {
      await stripeWebhookHandler(req, res);
    } catch (err) {
      next(err);
    }
  }
);

/* ---------------------------------------------------------
   ⭐ B3 — Request ID Injection
---------------------------------------------------------- */
app.use((req, res, next) => {
  const requestId = uuidv4();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
});

/* ---------------------------------------------------------
   ⭐ B3 — Structured Request Logging
---------------------------------------------------------- */
app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    if (req.originalUrl === "/api/health") return;

    logInfo("request.completed", {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
    });
  });

  next();
});

/* -------------------- Security Middleware -------------------- */
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(mongoSanitize());
app.use(xss());

/* -------------------- Compression / JSON -------------------- */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

/* -------------------- Logging (dev only) -------------------- */
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

/* -------------------- CORS -------------------- */
const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.CLIENT_URL_ADMIN,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (
        allowedOrigins.length === 0 &&
        process.env.NODE_ENV !== "production"
      ) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error("Not allowed by CORS: origin not whitelisted")
      );
    },
    credentials: true,
  })
);

/* -------------------- Rate Limiting -------------------- */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", apiLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: {
    success: false,
    message:
      "Too many authentication attempts from this IP. Please try again later.",
  },
});
app.use("/api/auth", authLimiter);

const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message:
      "Too many Helpio Pay requests detected. Please slow down or contact support.",
  },
});
app.use(
  [
    "/api/invoices",
    "/api/subscriptions",
    "/api/subscription-charges",
    "/api/terminal",
    "/api/refunds",
    "/api/ledger",
  ],
  paymentLimiter
);

/* ⭐ STRICT Helpio Pay abuse limiter (B10) */
app.use(
  [
    "/api/invoices",
    "/api/subscriptions",
    "/api/subscription-charges",
    "/api/terminal",
    "/api/refunds",
    "/api/ledger",
    "/api/payouts",
  ],
  helpioPayLimiter
);

/* -------------------- Health & Readiness -------------------- */
app.get("/", (req, res) => res.send("✅ Helpio backend is live"));
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.get("/api/ready", (req, res) => {
  const state = mongoose.connection.readyState;
  const map = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };

  if (state !== 1) {
    return res.status(503).json({
      status: "not_ready",
      db: map[state],
    });
  }

  return res.json({
    status: "ready",
    db: map[state],
  });
});

/* -------------------- API Routes -------------------- */
app.use("/api/auth", authRoutes);
app.use("/api/providers", providerRoutes);
app.use("/api/listings", listingRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/customers", customerTimelineRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/subscription-plans", subscriptionPlanRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/subscription-charges", subscriptionChargeRoutes);
app.use("/api/idempotency", idempotencyRoutes);
app.use("/api/ledger", ledgerRoutes);
app.use("/api/refunds", refundRoutes);
app.use("/api/disputes", disputeRoutes);
app.use("/api/payouts", payoutRoutes);
app.use("/api/terminal", terminalRoutes);
app.use("/api/admin/payouts", adminPayoutRoutes);
app.use("/api/admin/ledger", adminLedgerRoutes);

app.use("/api/payouts/dashboard", providerPayoutDashboardRoutes);
app.use("/api/financial-statements", financialStatementRoutes);
app.use("/api/admin/revenue", adminRevenueRoutes);
app.use("/api/admin/tax", adminTaxRoutes);
app.use("/api/admin", adminProviderFinancialRoutes);
app.use("/api/admin/fraud", adminFraudRoutes);
app.use("/api/admin/dashboard", adminDashboardRoutes);
app.use("/api/admin/auth-security", adminAuthSecurityRoutes);
app.use("/api/admin/suspicious", adminSuspiciousRoutes);

// Real terminal payments (future Stripe Terminal)
app.use("/api/terminal-payments", terminalPaymentRoutes);

// Expo-friendly simulated Tap-to-Pay
app.use("/api/terminal-payments-sim", terminalPaymentSimRoutes);

app.use((req, res, next) => {
  console.log("➡️", req.method, req.originalUrl);
  next();
});


/* ⭐ NEW — FULL ADMIN CRON SUITE */
app.use("/api/admin/cron", adminCronRoutes);

app.use("/api/balance", balanceHistoryRoutes);
app.use("/api/balance", balanceSummaryRoutes);

/* -------------------- Error Handling -------------------- */
app.use(notFound);
app.use(errorHandler);

/* -------------------- Start Server -------------------- */
const PORT = process.env.PORT || 10000;

connectDB().then(() => {
  app.listen(PORT, () =>
    console.log(`🚀 Helpio API running on port ${PORT}`)
  );

  /* Startup Billing Cron */
  startSubscriptionBillingCron();

  /* Nightly balance recalculation (3 AM UTC) */
  cron.schedule("0 3 * * *", nightlyBalanceRecalculation);

  /* Auto Payout Daily at 4 AM UTC */
  cron.schedule("0 4 * * *", runAutoPayoutCron);

  /* Monthly Statements (2:15 AM UTC on the 1st) */
  cron.schedule("15 2 1 * *", runMonthlyStatementsCron);
});
