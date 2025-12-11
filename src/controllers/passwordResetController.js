// src/controllers/passwordResetController.js
import crypto from "crypto";
import { User } from "../models/User.js";
import { PasswordResetToken } from "../models/PasswordResetToken.js";
import { logPasswordReset } from "../utils/authLogger.js";

/**
 * Helper to create a secure token & hash
 */
const createResetToken = () => {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
};

/* ----------------------------------------------------------
   1. REQUEST PASSWORD RESET
   POST /api/auth/password/request-reset
---------------------------------------------------------- */
export const requestPasswordReset = async (req, res, next) => {
  const { email } = req.body || {};

  try {
    await logPasswordReset(email, "password_reset_requested", req);

    if (!email) {
      await logPasswordReset(email, "password_reset_failed", req, {
        reason: "missing_email",
      });
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // Do NOT reveal user existence
      await logPasswordReset(email, "password_reset_failed", req, {
        reason: "email_not_found",
      });
      return res.json({ success: true });
    }

    // Clean existing tokens for this user
    await PasswordResetToken.deleteMany({ user: user._id });

    const { token, tokenHash } = createResetToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await PasswordResetToken.create({
      user: user._id,
      tokenHash,
      expiresAt,
    });

    await logPasswordReset(email, "password_reset_email_sent", req, {
      userId: user._id,
    });

    // TODO: send email with reset link using your email service.
    // For now (dev mode), we can return the token in response for testing.
    return res.json({
      success: true,
      resetToken: token, // remove in production; send via email instead
    });
  } catch (err) {
    await logPasswordReset(email, "password_reset_failed", req, {
      reason: "internal_error",
      error: err.message,
    });
    next(err);
  }
};

/* ----------------------------------------------------------
   2. VERIFY RESET TOKEN (optional helper endpoint)
   POST /api/auth/password/verify-token
---------------------------------------------------------- */
export const verifyResetToken = async (req, res, next) => {
  const { token } = req.body || {};

  try {
    if (!token) {
      await logPasswordReset(null, "password_reset_failed", req, {
        reason: "missing_token",
      });
      return res.status(400).json({
        success: false,
        message: "Token is required",
      });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const record = await PasswordResetToken.findOne({
      tokenHash,
      expiresAt: { $gt: new Date() },
    }).populate("user", "email");

    if (!record) {
      await logPasswordReset(null, "password_reset_failed", req, {
        reason: "invalid_or_expired_token",
      });
      return res.status(400).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    return res.json({
      success: true,
      email: record.user.email,
    });
  } catch (err) {
    await logPasswordReset(null, "password_reset_failed", req, {
      reason: "internal_error",
      error: err.message,
    });
    next(err);
  }
};

/* ----------------------------------------------------------
   3. RESET PASSWORD
   POST /api/auth/password/reset
---------------------------------------------------------- */
export const resetPassword = async (req, res, next) => {
  const { token, newPassword } = req.body || {};

  try {
    if (!token || !newPassword) {
      await logPasswordReset(null, "password_reset_failed", req, {
        reason: "missing_token_or_password",
      });
      return res.status(400).json({
        success: false,
        message: "Token and newPassword are required",
      });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const record = await PasswordResetToken.findOne({
      tokenHash,
      expiresAt: { $gt: new Date() },
    }).populate("user");

    if (!record || !record.user) {
      await logPasswordReset(null, "password_reset_failed", req, {
        reason: "invalid_or_expired_token",
      });
      return res.status(400).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    // Update password (assumes User schema hashes on save)
    record.user.password = newPassword;
    await record.user.save();

    // Delete used token(s)
    await PasswordResetToken.deleteMany({ user: record.user._id });

    await logPasswordReset(record.user.email, "password_reset_success", req, {
      userId: record.user._id,
    });

    return res.json({ success: true });
  } catch (err) {
    await logPasswordReset(null, "password_reset_failed", req, {
      reason: "internal_error",
      error: err.message,
    });
    next(err);
  }
};
