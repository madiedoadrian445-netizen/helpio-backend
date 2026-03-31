import { getActivityFeed } from "../../services/activityService.js";

export const getActivity = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const userId = req.user.id;
    const { limit = 50 } = req.query;

    const rawLimit = parseInt(limit, 10);
const safeLimit = Math.min(isNaN(rawLimit) ? 50 : rawLimit, 100);

const activity = await getActivityFeed(userId, {
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