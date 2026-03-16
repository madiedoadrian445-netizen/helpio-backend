import express from "express";
import { sendPushNotification } from "../utils/sendPushNotification.js";

const router = express.Router();

router.get("/test-push", async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        error: "Missing push token",
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

    res.json(result);

  } catch (err) {
    console.error("Push test error:", err);
    res.status(500).json({ error: "Push test failed" });
  }
});

export default router;