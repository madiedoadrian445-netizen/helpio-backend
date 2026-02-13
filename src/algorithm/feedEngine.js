import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import Listing from "../models/Listing.js";
import ProviderDailyStat from "../models/ProviderDailyStat.js";
import FeedSession from "../models/FeedSession.js";

/* =========================================================
   V1 CONFIG
========================================================= */
const SESSION_TTL_MINUTES = 60;
const MAX_RADIUS_MILES_DEFAULT = 60;
const PAGE_SIZE_DEFAULT = 20;
const IMPRESSION_TOP_N = 30;
const ACTIVE_WINDOW_DAYS = 7;
const TARGET_LEADS_PER_PROVIDER_PER_DAY = 3;

// distance tiers (miles)
const TIER_A = 5;
const TIER_B = 15;
const TIER_C = 35;
const TIER_D = 60;

/* =========================================================
   UTILITIES
========================================================= */
const milesToMeters = (m) => m * 1609.344;

const clamp01 = (x) => Math.max(0, Math.min(1, x));

const yyyyMmDd = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

// deterministic random float per provider per session
function hashToUnitFloat(input) {
  const hex = crypto.createHash("sha256").update(input).digest("hex");
  const intVal = parseInt(hex.slice(0, 13), 16); // 52-bit safe
  const max = Math.pow(2, 52) - 1;
  return clamp01(Math.max(intVal / max, 1e-12));
}

const getTier = (miles) => {
  if (miles <= TIER_A) return "A";
  if (miles <= TIER_B) return "B";
  if (miles <= TIER_C) return "C";
  return "D";
};

function computeWeight({ leadsToday }) {
  const saturation = leadsToday / TARGET_LEADS_PER_PROVIDER_PER_DAY;

  if (saturation < 0.5) return 1.25;
  if (saturation > 1.5) return 0.75;
  return 1.0;
}

const weightedKey = (r, w) => Math.pow(r, 1 / w);

const activeCutoff = () => {
  const d = new Date();
  d.setDate(d.getDate() - ACTIVE_WINDOW_DAYS);
  return d;
};

/* =========================================================
   SESSION MANAGEMENT
========================================================= */
async function getOrCreateSession(userId, refresh) {
  const now = new Date();

  let session = await FeedSession.findOne({
    user_id: userId,
    expires_at: { $gt: now },
  }).sort({ expires_at: -1 });

  if (!session || refresh) {
    session = await FeedSession.create({
      user_id: userId,
      session_id: uuidv4(),
      seed: Math.floor(Math.random() * 1_000_000_000),
      expires_at: new Date(now.getTime() + SESSION_TTL_MINUTES * 60 * 1000),
    });
  }

  return session;
}

/* =========================================================
   MAIN FEED ENGINE
========================================================= */
export async function buildFeed({
  userId,
  lat,
  lng,
  category = null,
  page = 1,
  pageSize = PAGE_SIZE_DEFAULT,
  radiusMiles = MAX_RADIUS_MILES_DEFAULT,
  refresh = false,
}) {
  /* ---------- session ---------- */
  const session = await getOrCreateSession(userId, refresh);
  const seed = session.seed;
  const day = yyyyMmDd();

  /* ---------- geo query ---------- */
  const listings = await Listing.aggregate([
    {
      $geoNear: {
        near: { type: "Point", coordinates: [lng, lat] },
        key: "location.coordinates",
        distanceField: "distanceMeters",
        spherical: true,
        maxDistance: milesToMeters(Math.min(radiusMiles, TIER_D)),
        query: {
          isActive: true,
          createdAt: { $gte: activeCutoff() },
          ...(category ? { category } : {}),
        },
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
        provider_id: "$provider",
        businessName: 1,
        title: 1,
        category: 1,
        photos: "$images",
        price: 1,
        location: "$location.coordinates",
        distanceMiles: 1,
      },
    },
    { $limit: 2000 },
  ]);

  if (!listings.length) {
    return {
      session,
      total: 0,
      items: [],
    };
  }

  /* ---------- provider stats ---------- */
  const providerIds = [...new Set(listings.map((l) => String(l.provider_id)))];

  const stats = await ProviderDailyStat.find({
    provider_id: { $in: providerIds },
    day,
  }).lean();

  const statsMap = new Map(stats.map((s) => [String(s.provider_id), s]));

  /* ---------- ranking ---------- */
  const tiers = { A: [], B: [], C: [], D: [] };

  for (const l of listings) {
    const tier = getTier(l.distanceMiles);

    const leadsToday = statsMap.get(String(l.provider_id))?.leads || 0;
    const weight = computeWeight({ leadsToday });

    const r = hashToUnitFloat(`${l.provider_id}:${seed}`);
    const key = weightedKey(r, weight);

    tiers[tier].push({ ...l, _feedKey: key });
  }

  Object.values(tiers).forEach((arr) =>
    arr.sort((a, b) => a._feedKey - b._feedKey)
  );

  const finalList = [...tiers.A, ...tiers.B, ...tiers.C, ...tiers.D];

  /* ---------- pagination ---------- */
  const start = (page - 1) * pageSize;
  const pageItems = finalList.slice(start, start + pageSize);

  /* ---------- impressions ---------- */
  const bulk = pageItems.slice(0, IMPRESSION_TOP_N).map((it) => ({
    updateOne: {
      filter: { provider_id: it.provider_id, day },
      update: { $inc: { impressions: 1 } },
      upsert: true,
    },
  }));

  if (bulk.length) await ProviderDailyStat.bulkWrite(bulk, { ordered: false });

  return {
    session,
    total: finalList.length,
    items: pageItems,
  };
}
