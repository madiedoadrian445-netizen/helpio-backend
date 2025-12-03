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

const router = express.Router();

/* ---------------------- AUTH ROUTES ---------------------- */
router.post("/register", register);
router.post("/login", login);
router.get("/me", protect, getMe);
router.post("/refresh", refreshToken);
router.post("/logout", logout);

/* ----------------------------------------------------------
   🔥 DEV-ONLY AUTO LOGIN (Single, clean, official endpoint)
---------------------------------------------------------- */
router.get("/dev-login", devLogin);

export default router;
