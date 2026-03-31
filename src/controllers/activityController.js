import Provider from "../models/Provider.js";
import { getActivityFeed } from "../../services/activityService.js";

export const getActivity = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // 🔥 STEP 1: Get provider from user
    const provider = await Provider.findOne({ user: req.user._id }).select("_id");

    if (!provider) {
      return res.status(401).json({
        success: false,
        message: "Provider not found",
      });
    }

    const { limit = 50 } = req.query;
    const rawLimit = parseInt(limit, 10);
    const safeLimit = Math.min(isNaN(rawLimit) ? 50 : rawLimit, 100);

    // 🔥 STEP 2: Use provider._id (NOT req.user)
    const activity = await getActivityFeed(provider._id, {
      limit: safeLimit,
    });

    res.json({
      success: true,
      activity,
    });

  } catch (err) {
    console.error("Activity error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch activity",
    });
  }
};