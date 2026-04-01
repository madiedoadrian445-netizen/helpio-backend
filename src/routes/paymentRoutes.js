import express from "express";
import { protect } from "../middleware/auth.js";
import Payment from "../models/paymentModel.js";
import LedgerEntry from "../models/LedgerEntry.js";
import Provider from "../models/Provider.js";


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
const provider = await Provider.findOne({ user: req.user._id });

if (!provider) {
  return res.status(400).json({
    success: false,
    message: "Provider not found",
  });
}

await LedgerEntry.create({
  provider: provider._id,            // ✅ correct
  customer: clientId,

  type: "charge",                    // ✅ required enum
  direction: "credit",               // ✅ required
  sourceType: "terminal",            // ✅ required

  amount: Number(amount),

  notes: `Paid with ${method || "Card"}${last4 ? ` •••• ${last4}` : ""}`,

  createdBy: "provider",
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