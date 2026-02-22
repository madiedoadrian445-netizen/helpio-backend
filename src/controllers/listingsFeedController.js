import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

import Listing from "../models/Listing.js";




import ProviderDailyStat from "../models/ProviderDailyStat.js";
import FeedSession from "../models/FeedSession.js";




// ---- V1 Defaults (match your spec) ----
const SESSION_TTL_MINUTES = 60;
const MAX_RADIUS_MILES_DEFAULT = 60;
const PAGE_SIZE_DEFAULT = 20;
const IMPRESSION_TOP_N = 30;
const ACTIVE_WINDOW_DAYS = 7;
const TARGET_LEADS_PER_PROVIDER_PER_DAY = 3;
const COOLDOWN_MINUTES_AFTER_LEAD = 45;

// distance tiers (miles)
const TIER_A = 5;
const TIER_B = 15;
const TIER_C = 35;
const TIER_D = 60;

function nowNY() {
  // keep simple: server time should be set correctly; if not, use luxon/timezone
  return new Date();
}

function yyyyMmDdNY(d = nowNY()) {
  // If you want exact America/New_York day boundaries, use luxon.
  // For Miami launch, this is usually fine if server is EST.
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function milesToMeters(miles) {
  return miles * 1609.344;
}

function clamp01(x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x;
}

// deterministic hash -> float (0,1)
function hashToUnitFloat(input) {
  const hex = crypto.createHash("sha256").update(input).digest("hex");
  // take first 13 hex chars = 52 bits (safe in JS integer precision)
  const first13 = hex.slice(0, 13);
  const intVal = parseInt(first13, 16); // up to 2^52 - 1
  const max = Math.pow(2, 52) - 1;
  const r = intVal / max;
  // avoid exact 0 (can cause key=0 and dominate)
  return clamp01(Math.max(r, 1e-12));
}

function getTier(distanceMiles) {
  if (distanceMiles <= TIER_A) return "A";
  if (distanceMiles <= TIER_B) return "B";
  if (distanceMiles <= TIER_C) return "C";
  return "D";
}

function computeWeight({ leadsToday, cooldownUntil }) {
  // saturation = leads / target
  const saturation = leadsToday / TARGET_LEADS_PER_PROVIDER_PER_DAY;

  let weight = 1.0;
  if (saturation < 0.5) weight = 1.25;
  else if (saturation > 1.5) weight = 0.75;

  if (cooldownUntil && new Date(cooldownUntil) > new Date()) {
    weight *= 0.5;
  }

  // safety clamp so we never do insane exponent behavior
  if (weight < 0.2) weight = 0.2;
  if (weight > 2.0) weight = 2.0;

  return weight;
}

// key = r^(1/weight)
function weightedKey(r, weight) {
  return Math.pow(r, 1 / weight);
}

// eligibility window date
function activeWindowCutoff() {
  const d = new Date();
  d.setDate(d.getDate() - ACTIVE_WINDOW_DAYS);
  return d;
}

async function getOrCreateSession({ userId, refresh }) {
  const now = new Date();

  // find valid existing session
  let session = await FeedSession.findOne({
    user_id: userId,
    expires_at: { $gt: now },
  }).sort({ expires_at: -1 });

  if (refresh || !session) {
    const session_id = uuidv4();
    // seed should be an int
    const seed = Math.floor(Math.random() * 1_000_000_000);

    const expires_at = new Date(now.getTime() + SESSION_TTL_MINUTES * 60 * 1000);

    session = await FeedSession.create({
      user_id: userId,
      session_id,
      seed,
      expires_at,
    });
  }

  return session;
}

export const getFeed = async (req, res) => {

  try {
  const userId =
  req.user?.id ||
  req.user?._id ||
  req.user?.userId ||
  null;

if (!userId) {
  return res.status(401).json({
    success: false,
    message: "Unauthorized — user missing in request",
  });
}


    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const searchQuery = req.query.search?.trim() || null;




    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ success: false, message: "lat/lng required" });
    }

    const category = req.query.category || null;
    const refresh = String(req.query.refresh || "false") === "true";

    const radiusMiles = Number(req.query.radius || MAX_RADIUS_MILES_DEFAULT);
    const maxRadiusMiles = Number.isFinite(radiusMiles) ? radiusMiles : MAX_RADIUS_MILES_DEFAULT;
    const maxRadiusMeters = milesToMeters(Math.min(maxRadiusMiles, TIER_D));

    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const pageSize = Math.min(
      50,
      Math.max(1, parseInt(req.query.pageSize || String(PAGE_SIZE_DEFAULT), 10))
    );

console.log("🔎 FEED DEBUG:", {
  lat,
  lng,
  searchQuery,
  category,
  radiusMiles: maxRadiusMiles,
  userId
});

    // 1) session seed
    const session = await getOrCreateSession({ userId, refresh });
    const seed = session.seed;
    const day = yyyyMmDdNY();

let matchedIds = null;

if (searchQuery) {
  const searchResults = await Listing.aggregate([
    {
      $search: {
        index: "default",
        compound: {
          should: [
            // Main multi-field search + fuzzy
            {
              text: {
                query: searchQuery,
                path: ["title", "description", "businessName", "category"],
                fuzzy: { maxEdits: 2, prefixLength: 2, maxExpansions: 50 },
                score: { boost: { value: 3 } }
              }
            },
            // Strong boost for exact-ish phrase matches in title & businessName
            {
              phrase: {
                query: searchQuery,
                path: ["title", "businessName"],
                score: { boost: { value: 8 } }
              }
            }
          ],
          minimumShouldMatch: 1
        }
      }
    },
    { $project: { _id: 1 } },
    { $limit: 500 }
  ]);

  matchedIds = searchResults.map((r) => r._id);

  // fallback: if search ran but found nothing, revert to normal feed
  if (matchedIds.length === 0) matchedIds = null;
}
console.log("🔍 SEARCH matchedIds:", matchedIds?.length || 0);
    // 2) geo + eligibility query (Listings)
    // assumes Listing has:
    // - provider_id
    // - location: { type: "Point", coordinates: [lng, lat] }
    // - is_suspended, is_verified
    // - last_active_at
    // - category (or categories)
    // - provider_service_radius_miles (optional) or serviceRadiusMiles
const match = { isActive: true };

if (category) {
  match.category = category;
}

if (matchedIds && matchedIds.length > 0) {
  match._id = { $in: matchedIds };
}

const pipeline = [
  {
    $geoNear: {
  near: { type: "Point", coordinates: [lng, lat] },
  key: "location.coordinates",              // ✅ CORRECT
  distanceField: "distanceMeters",
  spherical: true,
  maxDistance: maxRadiusMeters,
  query: match,
},

  },
  {
    $addFields: {
      distanceMiles: { $divide: ["$distanceMeters", 1609.344] },
    },
  },
  {
    $project: {
      _id: 1,
      provider_id: "$provider",                 // ✅ map schema -> expected field
      businessName: 1,
      title: 1,
      category: 1,
      photos: "$images",                        // ✅ map images -> photos
      price: 1,
     location: "$location",   // ✅ keep full structured location

      distanceMiles: 1,
    },
  },
  { $limit: 2000 },
];

console.log("Running feed aggregation...");


let rawListings = await Listing.aggregate(pipeline);

console.log("📍 GEO results (initial radius):", rawListings.length);

if (searchQuery && rawListings.length === 0) {
 console.log("🔁 Expanding radius for search to 200 miles...");
console.log("🔍 SEARCH matchedIds:", matchedIds?.length || 0);

  const expandedPipeline = [
    {
      $geoNear: {
        near: { type: "Point", coordinates: [lng, lat] },
        key: "location.coordinates",
        distanceField: "distanceMeters",
        spherical: true,
        maxDistance: milesToMeters(200), // expand to 200 miles
        query: match,
      },
    },
    {
      $addFields: {
        distanceMiles: { $divide: ["$distanceMeters", 1609.344] },
      },
    },
    { $project: pipeline[2].$project },
    { $limit: 2000 },
  ];

  rawListings = await Listing.aggregate(expandedPipeline);
}

// 🔥 remove listings missing provider
const listings = rawListings.filter((l) => l.provider_id != null);


    if (!listings.length) {
      return res.json({
        success: true,
        session_id: session.session_id,
        expires_at: session.expires_at,
        page,
        pageSize,
        total: 0,
        items: [],
      });
    }

    // 3) load today’s stats for providers in this result set
    const providerIds = [
  ...new Set(listings.map((l) => String(l.provider_id)).filter(Boolean)),
];

const stats = await ProviderDailyStat.find({
  providerId: { $in: providerIds },
  date: day,
}).lean();

    const statsMap = new Map();
    for (const s of stats) statsMap.set(String(s.providerId), s);


    // 4) tier + weight + deterministic weighted key
    const tiers = { A: [], B: [], C: [], D: [] };

    for (const l of listings) {
      const dist = Number(l.distanceMiles || 9999);
      const tier = getTier(dist);

      const st = statsMap.get(String(l.provider_id));
      const leadsToday = st?.leads || 0;
      const cooldownUntil = st?.cooldown_until || null;

      const weight = computeWeight({ leadsToday, cooldownUntil });

      // deterministic random per provider per session
      const r = hashToUnitFloat(`${String(l.provider_id)}:${seed}`);

      const key = weightedKey(r, weight);

      tiers[tier].push({
        ...l,
        tier,
        weight,
        _feedKey: key,
      });
    }

    // 5) sort within each tier by deterministic weighted key
    for (const k of ["A", "B", "C", "D"]) {
      tiers[k].sort((a, b) => a._feedKey - b._feedKey);
    }

    // 6) concat tiers
    const finalList = [...tiers.A, ...tiers.B, ...tiers.C, ...tiers.D];

    // 7) paginate (stable)
    const total = finalList.length;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const pageItems = finalList.slice(start, end).map((x) => {
      const { _feedKey, ...rest } = x;
      return rest;
    });

    // 8) impression logging (top N returned results only)
   // 8) impression logging (top N returned results only)
const impressionItems = pageItems
  .slice(0, IMPRESSION_TOP_N)
  .filter((it) => it.provider_id);

if (impressionItems.length) {
  const bulk = impressionItems.map((it) => ({
    updateOne: {
      filter: { providerId: String(it.provider_id), date: day },
      update: { $inc: { impressions: 1 } },
      upsert: true,
    },
  }));

  await ProviderDailyStat.bulkWrite(bulk, { ordered: false });
}


    return res.json({
      success: true,
      session_id: session.session_id,
      expires_at: session.expires_at,
      page,
      pageSize,
      total,
      items: pageItems,
    });
  } catch (err) {
  console.error("🔥 FEED CRASH:", err);
  return res.status(500).json({
    success: false,
    message: err.message,
    stack: err.stack,
  });
}

};

