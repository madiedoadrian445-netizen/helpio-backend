// src/middleware/authAttackPrecheck.js
import { AuthEvent } from "../models/AuthEvent.js";
import { SuspiciousEvent } from "../models/SuspiciousEvent.js";

const parseIntEnv = (name, fallback) => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * B22-D: Credential Stuffing & Brute-Force Defense
 *
 * This middleware runs BEFORE the login handler.
 * It checks recent failed login attempts:
 *  - Per account (email)
 *  - Per IP (global behavior)
 *
 * If thresholds are exceeded, it:
 *  - Creates a SuspiciousEvent ('attack_bruteforce' or 'attack_credential_stuffing')
 *  - Returns 429 Too Many Requests
 */



export const authAttackPrecheck = async (req, res, next) => {
  try {
    // ✅ DEV / EXPO / TUNNEL BYPASS (NO DB, NO BLOCKING)
    if (
      process.env.NODE_ENV !== "production" ||
      req.headers["user-agent"]?.includes("Expo") ||
      req.headers["user-agent"]?.includes("okhttp")
    ) {
      console.log("🛡️ authAttackPrecheck bypassed (dev/mobile)");
      return next();
    }

    const ip = req.ip;
const emailRaw = req.body?.email || "";
const email = emailRaw.toLowerCase().trim();



    // If we don't have at least an email or IP, there's nothing smart to check
    if (!ip && !email) return next();

    const windowMinutes = parseIntEnv(
      "HELPIO_AUTH_ATTACK_WINDOW_MINUTES",
      15
    );
    const now = new Date();
    const windowStart = new Date(
      now.getTime() - windowMinutes * 60 * 1000
    );

    // Thresholds (override via env if you want)
    const perAccountThreshold = parseIntEnv(
      "HELPIO_AUTH_PER_ACCOUNT_THRESHOLD",
      8
    ); // 8 failed attempts per account in window
    const perIpThreshold = parseIntEnv(
      "HELPIO_AUTH_PER_IP_THRESHOLD",
      25
    ); // 25 failed attempts from same IP in window
    const stuffingAccountThreshold = parseIntEnv(
      "HELPIO_AUTH_STUFFING_ACCOUNTS",
      5
    ); // 5+ different accounts from same IP

    // 1) Count failures for this account (email)
    const failForAccount = email
      ? await AuthEvent.countDocuments({
          email,
          eventType: "login_failed",
          createdAt: { $gte: windowStart },
        })
      : 0;

    // 2) Look at failures from this IP (global behavior)
    const failFromIpDocs = await AuthEvent.find({
      ip,
      eventType: "login_failed",
      createdAt: { $gte: windowStart },
    })
      .select("email user createdAt")
      .lean();

    const failFromIpTotal = failFromIpDocs.length;
    const distinctEmailsFromIp = new Set(
      failFromIpDocs
        .map((d) => (d.email || "").toLowerCase().trim())
        .filter((v) => v)
    );
    const failFromIpAccounts = distinctEmailsFromIp.size;

    // Decide if we should block
    let shouldBlock = false;
    let blockReason = null;
    let eventType = null;
    let riskScore = 0;
    let severity = "low";

    // Case 1: Brute-force against a single account
    if (failForAccount >= perAccountThreshold) {
      shouldBlock = true;
      eventType = "attack_bruteforce";
      blockReason = `Too many failed logins for this account in the last ${windowMinutes} minutes`;
      riskScore = Math.min(100, 50 + failForAccount * 5);
    }

    // Case 2: Credential stuffing / password spraying from one IP
    if (
      !shouldBlock &&
      failFromIpTotal >= perIpThreshold &&
      failFromIpAccounts >= stuffingAccountThreshold
    ) {
      shouldBlock = true;
      eventType = "attack_credential_stuffing";
      blockReason = `Credential stuffing behavior detected from this IP in the last ${windowMinutes} minutes`;
      riskScore = Math.min(
        100,
        60 + (failFromIpAccounts - stuffingAccountThreshold) * 5
      );
    }

    // If thresholds not hit → allow login attempt
    if (!shouldBlock) {
      return next();
    }

    // Map score → severity
    if (riskScore >= 80) severity = "critical";
    else if (riskScore >= 60) severity = "high";
    else if (riskScore >= 40) severity = "medium";

    // Log as SuspiciousEvent
    await SuspiciousEvent.create({
      user: null, // we may not know user yet
      type: eventType,
      riskScore,
      severity,
      ip,
      userAgent: req.headers["user-agent"],
      metadata: {
        email,
        failForAccount,
        failFromIpTotal,
        failFromIpAccounts,
        windowMinutes,
        reason: blockReason,
      },
    });

    // Block this login attempt
    return res.status(429).json({
      success: false,
      message:
        "Too many failed login attempts detected. Please try again later or reset your password.",
      error: {
        type: eventType,
        reason: blockReason,
      },
    });
  } catch (err) {
    console.error("authAttackPrecheck error:", err.message);
    // If detection fails, we do NOT block login — security must be fail-open
    return next();
  }
};
