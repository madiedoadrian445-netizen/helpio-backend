// src/utils/compromisedPassword.js
import crypto from "crypto";

/**
 * VERY IMPORTANT:
 * - Never log or store raw passwords.
 * - This helper only returns a risk assessment.
 *
 * In the future you can extend this to call an external
 * k-anonymity API (like HaveIBeenPwned) using SHA-1 prefixes.
 */

const COMMON_COMPROMISED = new Set(
  [
    "password",
    "password1",
    "password123",
    "123456",
    "12345678",
    "123456789",
    "qwerty",
    "qwerty123",
    "111111",
    "letmein",
    "admin",
    "welcome",
    "helpio",
    "helpio123",
  ].map((p) => p.toLowerCase())
);

const scoreToSeverity = (score) => {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
};

/**
 * Simple local heuristic:
 *  - Very short passwords -> high risk
 *  - Extremely common phrases -> critical risk
 *
 * Returns:
 *   {
 *     compromised: boolean,
 *     reason: string,
 *     score: number (0–100),
 *     severity: "low" | "medium" | "high" | "critical",
 *     source: "local_heuristic" | "external_service"
 *   }
 */
export const checkPasswordCompromised = async (password) => {
  if (!password || typeof password !== "string") {
    return {
      compromised: true,
      reason: "Missing or invalid password value",
      score: 90,
      severity: "high",
      source: "local_heuristic",
    };
  }

  const value = password.trim();
  const lower = value.toLowerCase();
  let compromised = false;
  let score = 0;
  let reason = null;

  // Length-based risk
  if (value.length < 8) {
    compromised = true;
    score = Math.max(score, 70);
    reason = reason || "Password is too short (minimum 8 characters recommended)";
  } else if (value.length < 10) {
    compromised = true;
    score = Math.max(score, 50);
    reason = reason || "Password is weak (consider 10+ characters)";
  }

  // Common password blacklist
  if (COMMON_COMPROMISED.has(lower)) {
    compromised = true;
    score = Math.max(score, 95);
    reason =
      reason ||
      "Password is extremely common and appears in public breach wordlists";
  }

  // Simple pattern detection (all digits, simple sequences, etc.)
  const allDigits = /^[0-9]+$/.test(value);
  if (allDigits && value.length <= 10) {
    compromised = true;
    score = Math.max(score, 80);
    reason =
      reason ||
      "Password is composed only of digits and is too short to be safe";
  }

  // If nothing triggered, mark as safe
  if (!compromised) {
    return {
      compromised: false,
      reason: null,
      score: 0,
      severity: "low",
      source: "local_heuristic",
    };
  }

  const severity = scoreToSeverity(score);

  return {
    compromised,
    reason,
    score,
    severity,
    source: "local_heuristic",
  };
};
