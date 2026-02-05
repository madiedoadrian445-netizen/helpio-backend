// src/algorithm/feedEngine.js
import Provider from "../models/Provider.js";
import { Listing } from "../models/Listing.js";

/**
 * In-memory session cache
 * sessionId -> listingId[]
 * (Redis later)
 */
const sessionCache = new Map();

/**
 * MAIN FEED RESOLVER
 */
export async function getFeed({
  userId,
  sessionId,
  feedType = "trending",
  limit = 20,
  radiusMiles = 25
}) {
  // 1️⃣ Lock feed per session
  if (sessionCache.has(sessionId)) {
    return sessionCache.get(sessionId).slice(0, limit);
  }

  // 2️⃣ Pull eligible providers
  const providers = await Provider.find({
    isSuspended: false
  }).select("_id isVerified honeymoonStart honeymoonEnd simArchetype");

  const providerIds = providers.map(p => p._id);

  // 3️⃣ Pull listings
  let listings = await Listing.find({
    provider: { $in: providerIds },
    isActive: true
  }).populate("provider");

  // 4️⃣ Score listings probabilistically
  const now = Date.now();

  const scored = listings.map(listing => {
    const p = listing.provider;

    let score = Math.random(); // base randomness

    // Honeymoon boost
    if (p.honeymoonStart && p.honeymoonEnd) {
      if (now >= p.honeymoonStart && now <= p.honeymoonEnd) {
        score *= 1.25; // controlled boost
      }
    }

    // Archetype bias (simulation only)
    const archetypeBoost = {
      elite: 1.4,
      solid: 1.15,
      average: 1.0,
      weak: 0.8
    };

    score *= archetypeBoost[p.simArchetype] || 1;

    // Verified trust boost
    if (p.isVerified) {
      score *= 1.1;
    }

    return {
      listing,
      score
    };
  });

  // 5️⃣ Sort probabilistically
  scored.sort((a, b) => b.score - a.score);

  const orderedListings = scored.map(x => x.listing);

  // 6️⃣ Cache session feed
  sessionCache.set(sessionId, orderedListings);

  return orderedListings.slice(0, limit);
}

/**
 * Explicit refresh handler
 */
export function refreshSession(sessionId) {
  sessionCache.delete(sessionId);
}
