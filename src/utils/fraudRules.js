// src/utils/fraudRules.js

/**
 * Fully Upgraded Fraud Rules Engine (B16 → B19)
 * Drop-in replacement for your existing fraudRules.js
 */

const normalizeAmountCents = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
};

const normalizeCurrency = (currency) => {
  if (!currency || typeof currency !== "string") return "usd";
  return currency.toLowerCase();
};

const normalizeCountry = (code) => {
  if (!code || typeof code !== "string") return null;
  return code.trim().toUpperCase();
};

const isDisposableEmail = (email) => {
  if (!email || typeof email !== "string") return false;

  const domain = email.toLowerCase().split("@")[1];
  if (!domain) return false;

  const disposableDomains = [
    "mailinator.com",
    "10minutemail.com",
    "guerrillamail.com",
    "tempmail.com",
    "trashmail.com",
    "yopmail.com",
  ];

  return disposableDomains.includes(domain);
};

/**
 * B19-complete fraud scoring (simple + explainable but powerful)
 */
export const computeRiskScore = (ctx = {}) => {
  let score = 0;
  const reasons = [];

  const {
    amountCents = 0,
    currency = "usd",
    sourceType, // "terminal" | "payout" | "invoice" | "subscription"
    isNewCustomer = false,
    hasPreviousChargebacks = false,
    recentDeclines = 0,
    recentAttempts = 0,
    ipAddress,
    userAgent,
    cardCountry,
    ipCountry,
    email,
  } = ctx;

  const amt = normalizeAmountCents(amountCents);
  const ipC = normalizeCountry(ipCountry);
  const cardC = normalizeCountry(cardCountry);

  /* -----------------------------------------
   * 1) AMOUNT-BASED RISK
   * --------------------------------------- */
  if (amt >= 10_000_000) { // >= $100,000
    score += 70;
    reasons.push("Extreme high amount (>= $100,000)");
  } else if (amt >= 2_500_000) { // >= $25,000
    score += 50;
    reasons.push("Very large amount (>= $25,000)");
  } else if (amt >= 500_000) { // >= $5,000
    score += 30;
    reasons.push("Large transaction (>= $5,000)");
  } else if (amt >= 200_000) { // >= $2,000
    score += 20;
    reasons.push("Medium-high amount (>= $2,000)");
  } else if (amt >= 100_000) { // >= $1,000
    score += 12;
    reasons.push("Medium amount (>= $1,000)");
  }

  if (isNewCustomer && amt >= 250_000) {
    score += 15;
    reasons.push("New customer + high amount (>= $2,500)");
  }

  /* -----------------------------------------
   * 2) CUSTOMER HISTORY
   * --------------------------------------- */
  if (hasPreviousChargebacks) {
    score += 40;
    reasons.push("Previous chargebacks");
  }

  // Velocity decline rules
  if (recentDeclines >= 5) {
    score += 30;
    reasons.push("5+ recent declines");
  } else if (recentDeclines >= 3) {
    score += 18;
    reasons.push("3+ recent declines");
  } else if (recentDeclines >= 1) {
    score += 8;
    reasons.push("At least one recent decline");
  }

  // High-frequency attempts
  if (recentAttempts >= 10) {
    score += 20;
    reasons.push("10+ payment attempts");
  } else if (recentAttempts >= 5) {
    score += 12;
    reasons.push("5+ payment attempts");
  } else if (recentAttempts >= 3) {
    score += 8;
    reasons.push("3+ payment attempts");
  }

  /* -----------------------------------------
   * 3) GEO / DEVICE ANOMALIES
   * --------------------------------------- */
  if (cardC && ipC && cardC !== ipC) {
    score += 25;
    reasons.push("Card country / IP country mismatch");
  }

  if (!userAgent || userAgent.trim().length < 10) {
    score += 12;
    reasons.push("Suspicious or missing User-Agent");
  }

  if (!ipAddress) {
    score += 12;
    reasons.push("Missing IP address");
  }

  /* -----------------------------------------
   * 4) EMAIL QUALITY
   * --------------------------------------- */
  if (email && typeof email === "string") {
    const lower = email.toLowerCase();

    if (!lower.includes("@") || lower.endsWith("@example.com")) {
      score += 10;
      reasons.push("Invalid or placeholder email pattern");
    }

    if (isDisposableEmail(email)) {
      score += 20;
      reasons.push("Disposable / temporary email provider");
    }
  }

  /* -----------------------------------------
   * 5) SOURCE TYPE CONTEXTUAL RISK
   * --------------------------------------- */
  if (sourceType === "payout") {
    score += 12;
    reasons.push("Outgoing payout (higher risk)");
  }

  if (sourceType === "terminal") {
    // Safer than online
    score -= 10;
    reasons.push("Terminal transaction (lower baseline risk)");
  }

  if (!sourceType || sourceType === "unknown") {
    score += 5;
    reasons.push("Unknown source type");
  }

  /* -----------------------------------------
   * ENSURE NON-NEGATIVE SCORE
   * --------------------------------------- */
  if (score < 0) score = 0;

  return { score, reasons };
};

/**
 * Convert risk score → level → action
 */
export const evaluateHelpioPayRisk = (ctx = {}) => {
  const { score, reasons } = computeRiskScore(ctx);

  let level = "low";
  let action = "allow";

  if (score >= 80) {
    level = "high";
    action = "block";
  } else if (score >= 50) {
    level = "medium";
    action = "review";
  } else {
    level = "low";
    action = "allow";
  }

  // Hard override: Chargebacks + high amount
  if (ctx.hasPreviousChargebacks && ctx.amountCents >= 500_000) {
    level = "high";
    action = "block";
    reasons.push("Override: chargebacks + >= $5,000");
  }

  // Hard override: Missing IP on large transactions
  if (!ctx.ipAddress && ctx.amountCents >= 1_000_000) {
    level = "high";
    action = "block";
    reasons.push("Override: missing IP + >= $10,000");
  }

  return {
    score,
    level,
    action,
    reasons,
    sourceType: ctx.sourceType || "unknown",
    amountCents: normalizeAmountCents(ctx.amountCents || 0),
    currency: normalizeCurrency(ctx.currency || "usd"),
  };
};
