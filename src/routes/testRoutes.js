import express from "express";
import { sendPushNotification } from "../utils/sendPushNotification.js";
import { protect, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

/* -------------------------------------------------------
   🔒 DEV / ADMIN ONLY — PUSH TEST
-------------------------------------------------------- */
router.get("/test-push", protect, requireAdmin, async (req, res) => {
  try {
    // 🔥 HARD BLOCK IN PRODUCTION (optional but recommended)
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({
        success: false,
        message: "Test routes are disabled in production",
      });
    }

    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Missing push token",
      });
    }

    const result = await sendPushNotification({
      token,
      title: "Helpio Test",
      body: "Push notifications are working 🚀",
      data: {
        type: "chat",
      },
    });

    res.json({
      success: true,
      result,
    });

  } catch (err) {
    console.error("Push test error:", err);
    res.status(500).json({
      success: false,
      message: "Push test failed",
    });
  }
});

export default router;