// src/routes/auth.routes.js
import express from "express";
import {
  register,
  login,
  getMe,
  refreshToken,
  logout,
} from "../controllers/auth.controller.js";

import { protect } from "../middleware/auth.js";
import { devLogin } from "../controllers/dev.controller.js";

import { logAuthEvent } from "../utils/authLogger.js";
import { authAttackPrecheck } from "../middleware/authAttackPrecheck.js";
import { registerProvider } from "../controllers/auth.controller.js";



// ⭐ Password Reset Controllers
import {
  requestPasswordReset,
  verifyResetToken,
  resetPassword,
} from "../controllers/passwordResetController.js";

// ⭐ MFA Controllers
import {
  startMFAChallenge,
  verifyMFAChallenge,
} from "../controllers/mfaController.js";

const router = express.Router();

/* Utility to capture IP + UA for audit logs */
const getContext = (req) => ({
  ip: req.ip,
  userAgent: req.headers["user-agent"],
});

/* ----------------------------------------------------------
   REGISTER
---------------------------------------------------------- */
router.post("/register", async (req, res, next) => {
  const { email } = req.body || {};
  const ctx = getContext(req);

  try {
   const response = await register(req, res, next);

    if (res.statusCode >= 200 && res.statusCode < 300) {
      await logAuthEvent({
        email,
        type: "register",
        ...ctx,
      });
    } else {
      await logAuthEvent({
        email,
        type: "register_failed",
        ...ctx,
        metadata: { status: res.statusCode },
      });
    }

    return response;
  } catch (err) {
    await logAuthEvent({
      email,
      type: "register_failed",
      ...ctx,
      metadata: { error: err.message },
    });
    next(err);
  }
});


/* ----------------------------------------------------------
   REGISTER PROVIDER
---------------------------------------------------------- */
router.post("/register-provider", registerProvider);



/* ----------------------------------------------------------
   LOGIN — now protected by authAttackPrecheck
---------------------------------------------------------- */
router.post("/login", authAttackPrecheck, async (req, res, next) => {
  const { email } = req.body || {};
  const ctx = getContext(req);

  try {
    const response = await login(req, res);

    if (res.statusCode >= 200 && res.statusCode < 300) {
      await logAuthEvent({
        user: req.user?._id,
        email,
        type: "login_success",
        ...ctx,
      });
    } else {
      await logAuthEvent({
        email,
        type: "login_failed",
        ...ctx,
        metadata: { status: res.statusCode },
      });
    }

    return response;
  } catch (err) {
    await logAuthEvent({
      email,
      type: "login_failed",
      ...ctx,
      metadata: { error: err.message },
    });
    next(err);
  }
});

/* ----------------------------------------------------------
   GET CURRENT USER
---------------------------------------------------------- */
router.get("/me", protect, getMe);

/* ----------------------------------------------------------
   REFRESH TOKEN
---------------------------------------------------------- */
router.post("/refresh", async (req, res, next) => {
  const ctx = getContext(req);

  try {
    const response = await refreshToken(req, res);

    await logAuthEvent({
      user: req.user?._id,
      email: req.user?.email,
      type: "token_refreshed",
      ...ctx,
    });

    return response;
  } catch (err) {
    await logAuthEvent({
      user: req.user?._id,
      email: req.user?.email,
      type: "refresh_failed",
      ...ctx,
      metadata: { error: err.message },
    });
    next(err);
  }
});

/* ----------------------------------------------------------
   LOGOUT
---------------------------------------------------------- */
router.post("/logout", async (req, res, next) => {
  const ctx = getContext(req);

  try {
    const response = await logout(req, res);

    await logAuthEvent({
      user: req.user?._id,
      email: req.user?.email,
      type: "logout",
      ...ctx,
    });

    return response;
  } catch (err) {
    await logAuthEvent({
      user: req.user?._id,
      email: req.user?.email,
      type: "logout_failed",
      ...ctx,
      metadata: { error: err.message },
    });
    next(err);
  }
});

/* ----------------------------------------------------------
   ⭐ PASSWORD RESET (B21-D)
---------------------------------------------------------- */
router.post("/password/request-reset", requestPasswordReset);
router.post("/password/verify-token", verifyResetToken);
router.post("/password/reset", resetPassword);

/* ----------------------------------------------------------
   ⭐ MFA (B21-D)
---------------------------------------------------------- */
router.post("/mfa/start", protect, startMFAChallenge);
router.post("/mfa/verify", protect, verifyMFAChallenge);

/* ----------------------------------------------------------
   🔥 DEV-ONLY LOGIN (logged)
---------------------------------------------------------- */
router.get("/dev-login", async (req, res, next) => {
  const ctx = getContext(req);

  try {
    const result = await devLogin(req, res);

    await logAuthEvent({
      type: "login_success",
      user: res.locals?.userId,
      email: res.locals?.email,
      ...ctx,
      metadata: { devLogin: true },
    });

    return result;
  } catch (err) {
    await logAuthEvent({
      type: "login_failed",
      ...ctx,
      metadata: { devLogin: true, error: err.message },
    });
    next(err);
  }
});

export default router;
