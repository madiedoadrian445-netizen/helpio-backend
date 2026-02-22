import Listing from "../models/Listing.js";

export const suggestSearch = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length === 0) {
      return res.json({ success: true, suggestions: [] });
    }

    const query = q.trim();

    // 1️⃣ Category matches
    const categoryMatches = await Listing.distinct("category", {
      category: { $regex: `^${query}`, $options: "i" },
    });

    // 2️⃣ Title matches (service name)
    const titleMatches = await Listing.find({
      title: { $regex: query, $options: "i" },
    })
      .limit(5)
      .select("title");

    const suggestions = [];

    // Add categories
    categoryMatches.slice(0, 5).forEach((cat) => {
      suggestions.push({
        type: "category",
        label: cat,
        subtitle: "Category",
        value: cat,
      });
    });

    // Add services
    titleMatches.forEach((item) => {
      suggestions.push({
        type: "service",
        label: item.title,
        subtitle: "Service",
        value: item.title,
      });
    });

    return res.json({
      success: true,
      suggestions,
    });
  } catch (err) {
    console.error("Suggest error:", err);
    return res.status(500).json({
      success: false,
      message: "Suggestion fetch failed",
    });
  }
};