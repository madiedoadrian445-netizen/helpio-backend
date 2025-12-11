import WebhookEventLog from "../models/WebhookEventLog.js";

/**
 * GET /api/webhooks/events
 * View Stripe webhook history with pagination + filters
 */
export const getWebhookEvents = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      type,
      status,
      livemode,
      startDate,
      endDate,
      search,
    } = req.query;

    const query = {};

    if (type) query.type = type;
    if (status) query.status = status;
    if (livemode === "true") query.livemode = true;
    if (livemode === "false") query.livemode = false;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    if (search) {
      query.$or = [
        { eventId: { $regex: search, $options: "i" } },
        { type: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;
    const total = await WebhookEventLog.countDocuments(query);

    const events = await WebhookEventLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Math.min(limit, 100));

    return res.json({
      success: true,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit),
      },
      events,
    });
  } catch (err) {
    console.error("❌ getWebhookEvents error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error retrieving webhook events.",
    });
  }
};
