// src/middleware/fraudCheck.js
import { evaluateHelpioPayRisk } from "../utils/fraudRules.js";
import { logInfo } from "../utils/logger.js";
import { FraudEvent } from "../models/FraudEvent.js";

/**
 * Helpio Pay Fraud Check Middleware (B16 → B19 → B20-D)
 *
 * Saves review/block events using your existing FraudEvent schema.
 */
export const fraudCheck =
  ({ sourceType = "unknown" } = {}) =>
  async (req, res, next) => {
    try {
      // Normalize amount → cents
      let amountCents = 0;

      if (typeof req.body.amountDollars !== "undefined") {
        amountCents = Math.floor(
          Number.parseFloat(req.body.amountDollars || "0") * 100
        );
      } else if (typeof req.body.amount !== "undefined") {
        amountCents = Math.floor(
          Number.parseFloat(req.body.amount || "0") * 100
        );
      } else if (typeof req.body.total !== "undefined") {
        amountCents = Math.floor(
          Number.parseFloat(req.body.total || "0") * 100
        );
      }

      // Run upgraded risk engine (B19)
      const risk = evaluateHelpioPayRisk({
        amountCents,
        currency: req.body.currency || "usd",
        sourceType,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        isNewCustomer: Boolean(req.body.isNewCustomer),
        hasPreviousChargebacks: Boolean(req.body.hasPreviousChargebacks),
        recentDeclines: Number(req.body.recentDeclines || 0),
        recentAttempts: Number(req.body.recentAttempts || 0),
        email: req.body.email,
        cardCountry: req.body.cardCountry,
        ipCountry: req.body.ipCountry,
      });

      // Attach fraud info for downstream usage
      req.fraud = risk;

      // Internal structured log
      logInfo("helpio.fraud.check", {
        requestId: req.requestId,
        sourceType,
        riskScore: risk.score,
        riskLevel: risk.level,
        riskAction: risk.action,
        reasons: risk.reasons,
        amountCents: risk.amountCents,
        currency: risk.currency,
        ip: req.ip,
        route: req.originalUrl,
        method: req.method,
      });

      // ================================
      // 💾 Persist FraudEvent for Admin
      // ================================
      if (risk.action === "review" || risk.action === "block") {
        try {
          await FraudEvent.create({
            user: req.user?._id || null,
            provider: req.user?.provider || null,

            ip: req.ip,
            userAgent: req.headers["user-agent"],

            route: req.originalUrl,
            method: req.method,

            amount: risk.amountCents,
            currency: risk.currency,

            decision: risk.action,
            score: risk.score,

            triggers: risk.reasons.map((msg) => ({
              ruleId: msg.replace(/\s+/g, "_").toLowerCase(),
              level:
                risk.level === "high"
                  ? "critical"
                  : risk.level === "medium"
                  ? "warning"
                  : "info",
              message: msg,
            })),

            metadata: {
              sourceType,
              email: req.body.email,
              cardCountry: req.body.cardCountry,
              ipCountry: req.body.ipCountry,
            },
          });
        } catch (err) {
          console.error("⚠ Failed to create FraudEvent:", err.message);
        }
      }

      // =====================================
      // 🚫 Block logic (unchanged from B16)
      // =====================================
      if (risk.action === "block") {
        return res.status(403).json({
          success: false,
          message:
            "This Helpio Pay request was blocked by our fraud protection system. Please contact support if you believe this is an error.",
          error: {
            type: "FRAUD_BLOCK",
            riskLevel: risk.level,
            riskScore: risk.score,
            reasons: risk.reasons,
          },
        });
      }

      // ⚠ Soft review
      if (risk.action === "review") {
        res.setHeader("X-Helpio-Risk-Score", String(risk.score));
        res.setHeader("X-Helpio-Risk-Level", risk.level);
      }

      return next();
    } catch (err) {
      console.error("fraudCheck middleware error:", err);
      return next();
    }
  };
