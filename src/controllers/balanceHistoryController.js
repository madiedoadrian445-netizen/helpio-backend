import LedgerEntry from "../models/LedgerEntry.js";
import Provider from "../models/Provider.js";

export const getBalanceHistory = async (req, res) => {
  try {
    const provider = await Provider.findOne({ user: req.user._id });
    if (!provider)
      return res.status(404).json({ success: false, message: "Provider not found." });

    const {
      limit = 50,
      page = 1,
      type,
      startDate,
      endDate,
    } = req.query;

    const filters = { provider: provider._id };

    if (type) filters.type = type;
    if (startDate || endDate)
      filters.createdAt = {
        ...(startDate ? { $gte: new Date(startDate) } : {}),
        ...(endDate ? { $lte: new Date(endDate) } : {}),
      };

    const entries = await LedgerEntry.find(filters)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    return res.json({
      success: true,
      page: Number(page),
      count: entries.length,
      entries,
    });
  } catch (err) {
    console.error("❌ getBalanceHistory error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
};
