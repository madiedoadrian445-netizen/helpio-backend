// src/controllers/adminProviderFinancialController.js
import mongoose from "mongoose";
import { getProviderFinancialOverview } from "../utils/providerFinancialAnalytics.js";

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

const ensureAdmin = (user) => {
  if (!user || !user.isAdmin) {
    const err = new Error("Admin access required");
    err.statusCode = 403;
    throw err;
  }
};

/**
 * GET /api/admin/providers/:providerId/financial-overview
 */
export const getProviderFinancialOverviewAdmin = async (req, res) => {
  try {
    ensureAdmin(req.user);

    const { providerId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(providerId)) {
      return sendError(res, 400, "Invalid provider ID");
    }

    const overview = await getProviderFinancialOverview(providerId);

    return res.json({
      success: true,
      provider: providerId,
      overview,
    });
  } catch (err) {
    console.error("getProviderFinancialOverviewAdmin error:", err);
    if (err.statusCode === 403) {
      return sendError(res, 403, "Admin access required");
    }
    return sendError(res, 500, "Failed to load provider financial overview");
  }
};
