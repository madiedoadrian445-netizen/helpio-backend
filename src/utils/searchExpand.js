// src/utils/searchExpand.js
const normalize = (s = "") =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ");

const PHRASE_MAP = [
  {
    // car wash / detailing intent
    triggers: [
      "car wash",
      "carwashing",
      "auto wash",
      "vehicle wash",
      "wash car",
      "wash my car",
      "car cleaning",
      "auto cleaning",
      "detail",
      "detailing",
      "car detail",
      "interior detail",
      "exterior detail",
      "ceramic",
      "ceramic coating",
      "wax",
      "waxing",
      "polish",
      "buff",
      "shampoo seats",
      "seat shampoo",
      "interior cleaning",
      "exterior cleaning"
    ],
    expand: [
      "detailing",
      "car detailing",
      "auto detailing",
      "mobile detailing",
      "car wash",
      "auto wash",
      "vehicle wash",
      "interior",
      "exterior",
      "ceramic coating",
      "waxing",
      "polishing"
    ],
    // optionally boost these categories if you have them:
    categoryBoost: ["detailing", "car_detailing", "carwash", "auto_detailing"]
  }
];

export function expandSearchQuery(raw) {
  const q = normalize(raw);
  if (!q) return { expanded: [], boostedCategories: [] };

  const tokens = new Set(q.split(" ").filter(Boolean));
  const phrases = new Set([q]);

  let boostedCategories = [];

  for (const rule of PHRASE_MAP) {
    const hit = rule.triggers.some((t) => q.includes(normalize(t)));
    if (hit) {
      rule.expand.forEach((x) => phrases.add(normalize(x)));
      boostedCategories = [...new Set([...boostedCategories, ...rule.categoryBoost])];
    }
  }

  // expanded list = original + expansions
  const expanded = Array.from(phrases).filter(Boolean);
  return { expanded, boostedCategories };
}