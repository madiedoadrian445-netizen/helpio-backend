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

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", protect, getMe);
router.post("/refresh", refreshToken);
router.post("/logout", logout);

export default router;
