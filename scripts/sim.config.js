// scripts/sim.config.js

export const SIM = {
  // Marketplace size
  counts: {
    providers: 1500,
    users: 25000,
    avgListingsPerProvider: 2.2,
  },

  // Real-world city clusters (for geo realism)
  cities: [
    { name: "Miami", lat: 25.7617, lng: -80.1918, radiusMiles: 25 },
    { name: "New York", lat: 40.7128, lng: -74.0060, radiusMiles: 25 },
    { name: "Los Angeles", lat: 34.0522, lng: -118.2437, radiusMiles: 30 },
    { name: "Houston", lat: 29.7604, lng: -95.3698, radiusMiles: 30 },
    { name: "Chicago", lat: 41.8781, lng: -87.6298, radiusMiles: 25 }
  ],

  // Categories (temporary string keys for simulation)
  categories: [
    "plumbing",
    "mobileMechanic",
    "detailing",
    "cleaning",
    "handyman",
    "barber",
    "moving",
    "electronicsRepair"
  ],

  // Provider behavior archetypes (CORE OF SIMULATION)
  providerArchetypes: [
    {
      key: "elite",
      pct: 10,
      responseSecRange: [30, 180],
      convoStartRate: 0.12,
      clickRate: 0.30,
      saveRate: 0.10,
      reviewScoreRange: [4.7, 5.0],
      isVerifiedChance: 0.95,
      isChoiceChance: 0.12,
      engagementMultiplier: 1.6
    },
    {
      key: "solid",
      pct: 30,
      responseSecRange: [120, 900],
      convoStartRate: 0.07,
      clickRate: 0.22,
      saveRate: 0.06,
      reviewScoreRange: [4.2, 4.6],
      isVerifiedChance: 0.70,
      isChoiceChance: 0.02,
      engagementMultiplier: 1.15
    },
    {
      key: "average",
      pct: 40,
      responseSecRange: [600, 3600],
      convoStartRate: 0.035,
      clickRate: 0.14,
      saveRate: 0.03,
      reviewScoreRange: [3.8, 4.2],
      isVerifiedChance: 0.35,
      isChoiceChance: 0.0,
      engagementMultiplier: 0.90
    },
    {
      key: "weak",
      pct: 20,
      responseSecRange: [1800, 21600],
      convoStartRate: 0.012,
      clickRate: 0.08,
      saveRate: 0.01,
      reviewScoreRange: [3.0, 3.7],
      isVerifiedChance: 0.10,
      isChoiceChance: 0.0,
      engagementMultiplier: 0.60
    }
  ],

  // Honeymoon simulation rules
  honeymoon: {
    durationDays: 5,
    activeHoneymoonPctAtStart: 12
  },

  // User behavior archetypes (used later)
  userArchetypes: [
    { key: "browser", pct: 55, sessionsPerWeek: [1, 3], searchChance: 0.25 },
    { key: "intent", pct: 35, sessionsPerWeek: [2, 6], searchChance: 0.55 },
    { key: "power", pct: 10, sessionsPerWeek: [5, 12], searchChance: 0.80 }
  ]
};

// Validation helper
export function validateSimConfig() {
  const sum = SIM.providerArchetypes.reduce((a, x) => a + x.pct, 0);
  if (sum !== 100) {
    throw new Error(`Provider archetype percentages must sum to 100 (got ${sum})`);
  }



}
validateSimConfig();
console.log("Simulation config OK");
