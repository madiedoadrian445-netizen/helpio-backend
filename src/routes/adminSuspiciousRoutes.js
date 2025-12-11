import express from "express";
import { protect } from "../middleware/auth.js";
import { SuspiciousEvent } from "../models/SuspiciousEvent.js";

const router = express.Router();

// Admin-only
const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ success: false, message: "Admin only" });
  }
  next();
};

/* -----------------------------------------------------------
   GET RECENT SUSPICIOUS EVENTS
----------------------------------------------------------- */
router.get("/", protect, adminOnly, async (req, res) => {
  const events = await SuspiciousEvent.find()
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  res.json({ success: true, events });
});

/* -----------------------------------------------------------
  DETAILS BY USER
----------------------------------------------------------- */
router.get("/user/:userId", protect, adminOnly, async (req, res) => {
  const events = await SuspiciousEvent.find({
    user: req.params.userId,
  })
    .sort({ createdAt: -1 })
    .lean();

  res.json({ success: true, events });
});

export default router;
