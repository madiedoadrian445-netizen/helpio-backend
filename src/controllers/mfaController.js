// src/controllers/mfaController.js
import crypto from "crypto";
import { MFASession } from "../models/MFASession.js";
import { logMFAEvent } from "../utils/authLogger.js";

/**
 * Helper to create 6-digit code + hash
 */
const createMFACode = () => {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = crypto.createHash("sha256").update(code).digest("hex");
  return { code, codeHash };
};

/* ----------------------------------------------------------
   1. START MFA CHALLENGE
   POST /api/auth/mfa/start
   (protected: requires logged-in user)
---------------------------------------------------------- */
export const startMFAChallenge = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    // Clean previous active sessions for this user
    await MFASession.deleteMany({
      user: user._id,
      consumed: false,
    });

    const { code, codeHash } = createMFACode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await MFASession.create({
      user: user._id,
      codeHash,
      expiresAt,
      consumed: false,
    });

    await logMFAEvent(user._id, user.email, "mfa_challenge_started", req);

    // TODO: send code via SMS / email / authenticator app
    // For now (dev), we can return the code in response.
    return res.json({
      success: true,
      code, // remove in production; deliver via secure channel
    });
  } catch (err) {
    next(err);
  }
};

/* ----------------------------------------------------------
   2. VERIFY MFA CHALLENGE
   POST /api/auth/mfa/verify
   Body: { code: "123456" }
---------------------------------------------------------- */
export const verifyMFAChallenge = async (req, res, next) => {
  try {
    const user = req.user;
    const { code } = req.body || {};

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    if (!code) {
      await logMFAEvent(user._id, user.email, "mfa_challenge_failed", req, {
        reason: "missing_code",
      });
      return res.status(400).json({
        success: false,
        message: "Code is required",
      });
    }

    const codeHash = crypto.createHash("sha256").update(code).digest("hex");

    const session = await MFASession.findOne({
      user: user._id,
      codeHash,
      consumed: false,
      expiresAt: { $gt: new Date() },
    });

    if (!session) {
      await logMFAEvent(user._id, user.email, "mfa_challenge_failed", req, {
        reason: "invalid_or_expired_code",
      });
      return res.status(400).json({
        success: false,
        message: "Invalid or expired code",
      });
    }

    session.consumed = true;
    await session.save();

    await logMFAEvent(user._id, user.email, "mfa_challenge_verified", req);

    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
