import Provider from "../models/Provider.js";
import ProviderBalance from "../models/ProviderBalance.js";
import Payout from "../models/Payout.js";

export const getBalanceSummary = async (req, res) => {
  try {
    const provider = await Provider.findOne({ user: req.user._id });
    if (!provider)
      return res
        .status(404)
        .json({ success: false, message: "Provider not found." });

    const balances = await ProviderBalance.find({
      provider: provider._id,
    }).lean();

    if (!balances.length)
      return res.json({
        success: true,
        currency: "usd",
        available: 0,
        pending: 0,
        reserved: 0,
        lifetimeGross: 0,
        lifetimeFees: 0,
        lifetimeNet: 0,
        lastPayout: null,
        nextPayoutEstimate: null,
      });

    // For Helpio V1 we assume USD only
    const bal = balances[0];

    const lastPayout = await Payout.findOne({
      provider: provider._id,
      status: "paid",
    })
      .sort({ createdAt: -1 })
      .lean();

    const nextPayoutEstimate = bal.pending > 0
      ? "T+7 rolling (funds will auto-settle into available)"
      : null;

    return res.json({
      success: true,
      
      currency: bal.currency,
      available: bal.available,
      pending: bal.pending,
      reserved: bal.reserved,

      lifetimeGross: bal.lifetimeGross,
      lifetimeFees: bal.lifetimeFees,
      lifetimeNet: bal.lifetimeNet,

      lastPayout: lastPayout
        ? {
            amount: lastPayout.netAmount || lastPayout.amount,
            date: lastPayout.createdAt,
            batchId: lastPayout.batchId || null,
          }
        : null,

      nextPayoutEstimate,
    });

  } catch (err) {
    console.error("❌ getBalanceSummary error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};
