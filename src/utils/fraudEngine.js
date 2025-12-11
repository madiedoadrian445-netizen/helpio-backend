// src/utils/fraudEngine.js

/**
 * Normalize currency safely.
 */
const normalizeCurrency = (currency) => {
  if (!currency || typeof currency !== "string") return "usd";
  return currency.toLowerCase();
};

/* ======================================================================
   Fraud Engine – B22 Enhanced Version
   Returns:
     {
       decision: "allow" | "review" | "block",
       fraudScore: Number,
       fraudFlags: [ { ruleId, level, message } ]
     }
======================================================================= */

/**
 * Evaluate fraud risk for ANY transaction or terminal payment.
 *
 * ctx = {
 *   userId,
 *   providerId,
 *   customerId,
 *   ip,
 *   userAgent,
 *   route,
 *   method,
 *   amountCents,
 *   currency,
 *   terminalType,
 *   deviceId,
 *   readerId,
 * }
 */
export const evaluateTransactionRisk = (ctx = {}) => {
  const {
    userId,
    providerId,
    customerId,
    ip,
    userAgent,
    route,
    method,
    amountCents = 0,
    currency,
    terminalType,
    deviceId,
    readerId,
  } = ctx;

  const flags = [];
  let score = 0;
  const normalizedCurrency = normalizeCurrency(currency);

  /* ======================================================
     RULE GROUP 1 — AMOUNT / VALUE HEURISTICS
  ====================================================== */

  if (amountCents >= 10_000_000) {
    // >= $100k — impossible for service payments
    score += 90;
    flags.push({
      ruleId: "amount_extreme_high",
      level: "critical",
      message: `Amount ${amountCents} (${normalizedCurrency}) extremely high`,
    });
  } else if (amountCents >= 2_500_000) {
    score += 60;
    flags.push({
      ruleId: "amount_very_large",
      level: "critical",
      message: `Amount ${amountCents} (${normalizedCurrency}) unusually large`,
    });
  } else if (amountCents >= 500_000) {
    score += 25;
    flags.push({
      ruleId: "amount_large",
      level: "warning",
      message: `Amount ${amountCents} (${normalizedCurrency}) high`,
    });
  }

  /* ======================================================
     RULE GROUP 2 — AUTH CONTEXT
  ====================================================== */

  const isSensitiveRoute =
    route?.startsWith("/api/invoices") ||
    route?.startsWith("/api/subscriptions") ||
    route?.startsWith("/api/subscription-charges") ||
    route?.startsWith("/api/terminal") ||
    route?.startsWith("/api/refunds") ||
    route?.startsWith("/api/ledger") ||
    route?.startsWith("/api/payouts");

  if (isSensitiveRoute && !userId) {
    score += 70;
    flags.push({
      ruleId: "missing_auth_sensitive_route",
      level: "critical",
      message: "Sensitive payment route accessed without authenticated user",
    });
  }

  /* ======================================================
     RULE GROUP 3 — IP / USER AGENT / DEVICE SIGNALS
  ====================================================== */

  if (!ip) {
    score += 15;
    flags.push({
      ruleId: "missing_ip",
      level: "warning",
      message: "No IP address detected",
    });
  }

  if (!userAgent || userAgent.length < 10) {
    score += 15;
    flags.push({
      ruleId: "suspicious_user_agent",
      level: "warning",
      message: "User agent absent or too short",
    });
  }

  if (!deviceId && route?.startsWith("/api/terminal")) {
    score += 20;
    flags.push({
      ruleId: "missing_terminal_device_id",
      level: "warning",
      message: "Terminal transaction missing deviceId",
    });
  }

  if (!readerId && route?.startsWith("/api/terminal")) {
    score += 10;
    flags.push({
      ruleId: "missing_terminal_reader_id",
      level: "warning",
      message: "Terminal transaction missing readerId",
    });
  }

  /* ======================================================
     RULE GROUP 4 — PROVIDER / CUSTOMER CONTEXT
  ====================================================== */

  if (route?.startsWith("/api/payouts") && !providerId) {
    score += 50;
    flags.push({
      ruleId: "missing_provider_payout",
      level: "critical",
      message: "Payout route accessed without provider context",
    });
  }

  if (amountCents >= 200_000 && !customerId) {
    // >= $2000 anonymous customer
    score += 30;
    flags.push({
      ruleId: "anon_large_transaction",
      level: "critical",
      message: "High-value transaction without customer linkage",
    });
  }

  /* ======================================================
     DECISION LOGIC
  ====================================================== */

  let decision = "allow";

  if (score >= 80) decision = "block";
  else if (score >= 40) decision = "review";

  return {
    decision,
    fraudScore: score,
    fraudFlags: flags,
  };
};

/* =====================================================================
   STORE METADATA INTO TERMINAL PAYMENT
   This is used by B22 to embed:
   metadata.fraud = {
     decision,
     fraudScore,
     fraudFlags
   }
====================================================================== */

export const attachFraudMetadata = (paymentDoc, fraudResult) => {
  if (!paymentDoc || typeof paymentDoc !== "object") return paymentDoc;

  paymentDoc.metadata = paymentDoc.metadata || {};
  paymentDoc.metadata.fraud = {
    decision: fraudResult.decision,
    fraudScore: fraudResult.fraudScore,
    fraudFlags: fraudResult.fraudFlags,
  };

  return paymentDoc;
};

/* =====================================================================
   SANITIZE FOR PROVIDER VIEW
   (Providers should NOT see internal weightings or ruleIDs)
====================================================================== */

export const sanitizeFraudForProvider = (fraudMetadata) => {
  if (!fraudMetadata) return {};

  return {
    decision: fraudMetadata.decision || "allow",
    fraudScore: fraudMetadata.fraudScore || 0,
    // remove ruleIds for external view
    fraudFlags: (fraudMetadata.fraudFlags || []).map((f) => ({
      level: f.level,
      message: f.message,
    })),
  };
};
