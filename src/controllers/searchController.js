// src/controllers/searchController.js
import Category from "../models/Category.js";

const escapeRegex = (text = "") =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const suggestSearch = async (req, res) => {
  try {
    const raw = (req.query.q || "").trim();

    if (!raw) {
      return res.json({ success: true, suggestions: [] });
    }

    const q = escapeRegex(raw);

    // 1️⃣ Strongest: Category name prefix
    const nameMatches = await Category.find({
      isActive: true,
      name: { $regex: `^${q}`, $options: "i" },
    })
      .sort({ order: 1, name: 1 })
      .limit(8)
      .select("name slug");

    // 2️⃣ Keyword match (correct array handling)
    const keywordMatches = await Category.find({
      isActive: true,
      keywords: {
        $elemMatch: { $regex: q, $options: "i" },
      },
      _id: { $nin: nameMatches.map((c) => c._id) },
    })
      .sort({ order: 1, name: 1 })
      .limit(Math.max(0, 8 - nameMatches.length))
      .select("name slug");

    const combined = [...nameMatches, ...keywordMatches];

    const suggestions = combined.map((cat) => ({
      type: "category",
      label: cat.name,
      subtitle: "Category",
      value: cat.slug,
    }));

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