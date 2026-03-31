import express from "express";
import { protect } from "../middleware/auth.js";
import Payment from "../models/paymentModel.js";
import Activity from "../models/activityModel.js";



const router = express.Router();

/* -----------------------------------------
   CREATE PAYMENT (from receipt)
------------------------------------------ */
router.post("/", protect, async (req, res) => {
  try {
    const {
      clientId,
      amount,
      transactionId,
      method,
      last4,
      status,
      date,
    } = req.body;

    const payment = await Payment.create({

      userId: req.user._id, // 🔥 CRITICAL
      clientId,
      amount,
      transactionId,
      method,
      last4,
      status,
      date,
    });

await Activity.create({
  userId: req.user._id,

  category: "payment",

  title: "Payment received",
  message: `Payment from client`,

  amount: amount,

  customerId: clientId, // 🔥 THIS is what links it to ClientProfile
});


    res.json({ success: true, payment });

  } catch (err) {
    console.error("❌ Create payment error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to save payment",
    });
  }
});

/* -----------------------------------------
   GET PAYMENTS BY CLIENT
------------------------------------------ */
router.get("/client/:clientId", protect, async (req, res) => {
  try {
    const payments = await Payment.find({
      clientId: req.params.clientId,
      userId: req.user._id, // 🔥 CRITICAL
    }).sort({ createdAt: -1 });

    res.json({ success: true, payments });

  } catch (err) {
    console.error("❌ Fetch payments error:", err);
    res.status(500).json({
      success: false,
    });
  }
});

export default router;