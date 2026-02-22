import Listing from "../models/Listing.js";

const toTitleCase = (str = "") =>
  str
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

export const suggestSearch = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length === 0) {
      return res.json({ success: true, suggestions: [] });
    }

    const query = q.trim();

    // ✅ Category-only matches
    const categoryMatches = await Listing.distinct("category", {
      category: { $regex: `^${query}`, $options: "i" },
    });

    // ✅ normalize + dedupe + cap
    const seen = new Set();
    const suggestions = [];

    for (const raw of categoryMatches) {
      if (!raw) continue;
      const label = toTitleCase(String(raw).trim());
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      suggestions.push({
        type: "category",
        label,
        subtitle: "Category",
        value: label,
      });

      if (suggestions.length >= 8) break;
    }

    return res.json({ success: true, suggestions });
  } catch (err) {
    console.error("Suggest error:", err);
    return res.status(500).json({
      success: false,
      message: "Suggestion fetch failed",
    });
  }
};