// src/routes/auth.routes.js
import express from "express";
import {
  register,
  login,
  getMe,
  refreshToken,
  logout,
  sendPhoneCode,
  verifyPhoneCode,
  registerProvider
} from "../controllers/auth.controller.js";

import { protect } from "../middleware/auth.js";
import { devLogin } from "../controllers/dev.controller.js";
import { authAttackPrecheck } from "../middleware/authAttackPrecheck.js";

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

/* ----------------------------------------------------------
   REGISTER
---------------------------------------------------------- */
router.post("/register", register);

/* ----------------------------------------------------------
   PHONE VERIFICATION
---------------------------------------------------------- */
router.post("/send-phone-code", sendPhoneCode);
router.post("/verify-phone-code", verifyPhoneCode);

/* ----------------------------------------------------------
   REGISTER PROVIDER
---------------------------------------------------------- */
router.post("/register-provider", registerProvider);

/* ----------------------------------------------------------
   LOGIN
---------------------------------------------------------- */
router.post("/login", authAttackPrecheck, login);

/* ----------------------------------------------------------
   GET CURRENT USER
---------------------------------------------------------- */
router.get("/me", protect, getMe);

/* ----------------------------------------------------------
   REFRESH TOKEN
---------------------------------------------------------- */
router.post("/refresh", refreshToken);

/* ----------------------------------------------------------
   LOGOUT
---------------------------------------------------------- */
router.post("/logout", logout);

/* ----------------------------------------------------------
   PASSWORD RESET
---------------------------------------------------------- */
router.post("/password/request-reset", requestPasswordReset);
router.post("/password/verify-token", verifyResetToken);
router.post("/password/reset", resetPassword);

/* ----------------------------------------------------------
   MFA
---------------------------------------------------------- */
router.post("/mfa/start", protect, startMFAChallenge);
router.post("/mfa/verify", protect, verifyMFAChallenge);

/* ----------------------------------------------------------
   DEV LOGIN
---------------------------------------------------------- */
router.get("/dev-login", devLogin);

export default router;