// src/server.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import morgan from "morgan";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import xss from "xss-clean";
import rateLimit from "express-rate-limit";
import cron from "node-cron";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";

import { runAutoPayoutCron } from "./cron/autoPayoutCron.js";
import { stripeWebhookHandler } from "./controllers/stripeWebhookController.js";
import { connectDB } from "./config/db.js";
import { notFound, errorHandler } from "./middleware/errorMiddleware.js";
import { logInfo } from "./utils/logger.js";
import { startSubscriptionBillingCron } from "./cron/subscriptionBillingCron.js";
import { nightlyBalanceRecalculation } from "./cron/recalculateBalancesCron.js";
import { runMonthlyStatementsCron } from "./cron/monthlyStatementsCron.js";
import { helpioPayLimiter } from "./middleware/helpioPayLimiter.js";
import { initSocket } from "./socket.js";

import balanceHistoryRoutes from "./routes/balanceHistoryRoutes.js";
import balanceSummaryRoutes from "./routes/balanceSummaryRoutes.js";
import adminRevenueRoutes from "./routes/adminRevenueRoutes.js";
import adminFraudRoutes from "./routes/adminFraudRoutes.js";
import adminDashboardRoutes from "./routes/adminDashboardRoutes.js";
import adminAuthSecurityRoutes from "./routes/adminAuthSecurityRoutes.js";
import adminSuspiciousRoutes from "./routes/adminSuspiciousRoutes.js";
import terminalPaymentSimRoutes from "./routes/terminalPaymentSimRoutes.js";
import conversationRoutes from "./routes/conversationRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import serviceRoutes from "./routes/service.routes.js";
import searchRoutes from "./routes/searchRoutes.js";
import reviewRoutes from "./routes/review.routes.js";
import stripeConnectRoutes from "./routes/stripeConnectRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import testRoutes from "./routes/testRoutes.js";
import idempotencyRoutes from "./routes/idempotencyRoutes.js";
import adminPayoutRoutes from "./routes/adminPayoutRoutes.js";
import adminLedgerRoutes from "./routes/adminLedgerRoutes.js";
import adminCronRoutes from "./routes/adminCronRoutes.js";
import stripeIdentityRoutes from "./routes/stripeIdentityRoutes.js";
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
import ledgerRoutes from "./routes/ledgerRoutes.js";
import payoutRoutes from "./routes/payoutRoutes.js";
import terminalPaymentRoutes from "./routes/terminalPaymentRoutes.js";
import providerPayoutDashboardRoutes from "./routes/providerPayoutDashboardRoutes.js";
import financialStatementRoutes from "./routes/financialStatementRoutes.js";
import adminTaxRoutes from "./routes/adminTaxRoutes.js";
import adminProviderFinancialRoutes from "./routes/adminProviderFinancialRoutes.js";
import feedRoutes from "./routes/feedRoutes.js";
import stripeBalanceRoutes from "./routes/stripeBalanceRoutes.js";
import stripePayoutRoutes from "./routes/stripePayoutRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import activityRoutes from "./routes/activityRoutes.js";
import RedisStore from "rate-limit-redis";
import { redisClient } from "./config/redis.js";




const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ---------------------------------------------------------
   PROCESS ERROR HANDLERS
   FIX #20 — uncaughtException exits after logging so the
   process manager (Render) can restart cleanly.
---------------------------------------------------------- */
process.on("unhandledRejection", (reason) => {
  console.error("💥 UNHANDLED REJECTION:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("💥 UNCAUGHT EXCEPTION:", err?.message, err?.stack);
  setTimeout(() => process.exit(1), 500);
});

/* -------------------- App -------------------- */
const app = express();

app.disable("x-powered-by");

/* ---------------------------------------------------------
   TRUST PROXY
   Required for Render + Cloudflare — ensures req.ip is the
   real client IP for rate limiters to work correctly.
---------------------------------------------------------- */
app.set("trust proxy", 1);

/* ---------------------------------------------------------
   STRIPE WEBHOOK
   Must come before express.json() — Stripe requires raw body.
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
   REQUEST ID INJECTION
---------------------------------------------------------- */
app.use((req, res, next) => {
  const requestId = uuidv4();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
});

/* ---------------------------------------------------------
   STRUCTURED REQUEST LOGGING
   FIX #1 — Raw console.log middleware removed entirely.
   Only the structured logInfo logger runs in production.
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

/* -------------------- Security -------------------- */
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(mongoSanitize());
app.use(xss());

/* ---------------------------------------------------------
   COMPRESSION
   FIX #15 — Compresses all JSON responses.
   Significantly reduces bandwidth at scale.
---------------------------------------------------------- */
app.use(compression());

/* ---------------------------------------------------------
   BODY PARSING
   FIX #16 — Global limit reduced from 10mb to 50kb.
   Upload routes handle their own limits via multer.
---------------------------------------------------------- */
app.use(express.json({ limit: "50kb" }));
app.use(express.urlencoded({ extended: true, limit: "50kb" }));
app.use(cookieParser());

/* -------------------- Dev Logging -------------------- */
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
      if (origin.endsWith(".trycloudflare.com")) return callback(null, true);
      if (
        origin.startsWith("http://localhost") ||
        origin.startsWith("http://127.0.0.1")
      )
        return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS: origin not whitelisted"));
    },
    credentials: true,
  })
);

/* ---------------------------------------------------------
   RATE LIMITERS
   FIX #17 — All limiters use x-forwarded-for via
   keyGenerator so they work correctly behind Render/CF.
   Without this, req.ip is the proxy IP and all users share
   one rate limit bucket.

   FIX #19 — Dedicated feed limiter added.

   NOTE (FIX #21) — Add Redis store here before horizontal
   scaling. In-memory store is per-instance only.
---------------------------------------------------------- */
const getClientIp = (req) =>
  req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
    prefix: "rl:api:",
  }),
  handler: (req, res) =>
    res.status(429).json({
      success: false,
      message: "Too many requests. Please try again later.",
    }),
});



app.use("/api", apiLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  keyGenerator: getClientIp,
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
    prefix: "rl:auth:",
  }),
  handler: (req, res) =>
    res.status(429).json({
      success: false,
      message: "Too many authentication attempts. Please try again later.",
    }),
});



app.use("/api/auth", authLimiter);

/* FIX #19 — Feed-specific rate limiter
   Feed is geo query + stats lookup + session on every call.
   60 req/min = 1/second average, generous for normal use. */
const feedLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: getClientIp,
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
    prefix: "rl:feed:",
  }),
  handler: (req, res) =>
    res.status(429).json({
      success: false,
      message: "Too many feed requests. Please slow down.",
    }),
});



app.use("/api/feed", feedLimiter);
const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
    prefix: "rl:payment:",
  }),
  handler: (req, res) =>
    res.status(429).json({
      success: false,
      message: "Too many Helpio Pay requests. Please slow down or contact support.",
    }),
});



app.use(
  [
    "/api/invoices",
    "/api/subscriptions",
    "/api/subscription-charges",
    "/api/terminal",
    "/api/ledger",
  ],
  paymentLimiter
);

app.use(
  [
    "/api/invoices",
    "/api/subscriptions",
    "/api/subscription-charges",
    "/api/terminal",
    "/api/ledger",
    "/api/payouts",
  ],
  helpioPayLimiter
);

/* -------------------- Static Files -------------------- */
app.use(
  "/seed-images",
  express.static(path.join(__dirname, "..", "assets", "seed-images"))
);

// NOTE: Remove if Cloudinary is your sole image store.
app.use(
  "/uploads",
  express.static(path.join(__dirname, "..", "uploads"))
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
  if (state !== 1)
    return res.status(503).json({ status: "not_ready", db: map[state] });
  return res.json({ status: "ready", db: map[state] });
});

/* ---------------------------------------------------------
   API ROUTES
   FIX #18 — /api/payouts/dashboard mounted BEFORE
   /api/payouts to prevent Express matching dashboard
   requests against the payouts router first.
---------------------------------------------------------- */
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
// ❌ Disabled for v1
// app.use("/api/refunds", refundRoutes);
// app.use("/api/disputes", disputeRoutes);

// FIX #18 — dashboard BEFORE payouts
app.use("/api/payouts/dashboard", providerPayoutDashboardRoutes);
app.use("/api/payouts", payoutRoutes);

app.use("/api/terminal", terminalRoutes);
app.use("/api/terminal-payments", terminalPaymentRoutes);
app.use("/api/terminal-payments-sim", terminalPaymentSimRoutes);
app.use("/api/admin/payouts", adminPayoutRoutes);
app.use("/api/admin/ledger", adminLedgerRoutes);
app.use("/api/admin/cron", adminCronRoutes);
app.use("/api/admin/revenue", adminRevenueRoutes);
app.use("/api/admin/tax", adminTaxRoutes);
app.use("/api/admin/fraud", adminFraudRoutes);
app.use("/api/admin/dashboard", adminDashboardRoutes);
app.use("/api/admin/auth-security", adminAuthSecurityRoutes);
app.use("/api/admin/suspicious", adminSuspiciousRoutes);
app.use("/api/admin", adminProviderFinancialRoutes);
app.use("/api/feed", feedRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/financial-statements", financialStatementRoutes);
app.use("/api/stripe", stripeConnectRoutes);
app.use("/api/stripe", stripeBalanceRoutes);
app.use("/api/stripe", stripePayoutRoutes);
app.use("/api/stripe", stripeIdentityRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/balance", balanceHistoryRoutes);
app.use("/api/balance", balanceSummaryRoutes);
app.use("/api/test", testRoutes);

/* -------------------- Error Handling -------------------- */
app.use(notFound);
app.use(errorHandler);

/* -------------------- Start Server -------------------- */
const PORT = process.env.PORT || 10000;

connectDB().then(() => {
  const server = http.createServer(app);

  initSocket(server);

  server.listen(PORT, "0.0.0.0", () =>
    logInfo("server.started", { port: PORT })
  );

  startSubscriptionBillingCron();
  cron.schedule("0 3 * * *", nightlyBalanceRecalculation);
  cron.schedule("0 4 * * *", runAutoPayoutCron);
  cron.schedule("15 2 1 * *", runMonthlyStatementsCron);
});