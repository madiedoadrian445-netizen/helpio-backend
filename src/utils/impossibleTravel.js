// src/utils/impossibleTravel.js
import geoip from "geoip-lite";
import { SuspiciousEvent } from "../models/SuspiciousEvent.js";

const EARTH_RADIUS_KM = 6371;

const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const toRad = (v) => (v * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const IMPOSSIBLE_SPEED_KMH = 900; // ~max commercial jet speed

export const detectImpossibleTravel = async ({
  userId,
  ip,
  userAgent,
  email,
}) => {
  try {
    if (!userId || !ip) return null;

    const lookup = geoip.lookup(ip);
    if (!lookup || !lookup.ll) return null;

    const [lat, lon] = lookup.ll;

    const nowLocation = {
      country: lookup.country,
      region: lookup.region,
      city: lookup.city,
      lat,
      lon,
    };

    // Get last location-related event for this user
    const last = await SuspiciousEvent.findOne({
      user: userId,
      type: { $in: ["impossible_travel", "new_location"] },
      lat: { $ne: null },
      lon: { $ne: null },
    })
      .sort({ createdAt: -1 })
      .lean();

    // No baseline → create new_location & bail
    if (!last) {
      return await SuspiciousEvent.create({
        user: userId,
        type: "new_location",
        riskScore: 10,
        severity: "low",
        ip,
        userAgent,
        ...nowLocation,
        metadata: {
          email,
          reason: "First recorded login location for this user",
        },
      });
    }

    const distanceKm = haversineDistance(last.lat, last.lon, lat, lon);
    const hoursSinceLast = Math.max(
      (Date.now() - new Date(last.createdAt).getTime()) / 3_600_000,
      0.001
    );
    const speedRequired = distanceKm / hoursSinceLast;

    if (speedRequired > IMPOSSIBLE_SPEED_KMH) {
      const riskScore = Math.min(
        100,
        Math.floor((speedRequired / IMPOSSIBLE_SPEED_KMH) * 80)
      );

      const severity =
        riskScore >= 80
          ? "critical"
          : riskScore >= 60
          ? "high"
          : riskScore >= 40
          ? "medium"
          : "low";

      return await SuspiciousEvent.create({
        user: userId,
        type: "impossible_travel",
        riskScore,
        severity,
        ip,
        userAgent,
        ...nowLocation,
        previousLogin: {
          ip: last.ip,
          country: last.country,
          city: last.city,
          region: last.region,
          lat: last.lat,
          lon: last.lon,
          at: last.createdAt,
        },
        metadata: {
          email,
          distanceKm,
          hoursSinceLast,
          speedRequired,
          reason: "Impossible travel detected between last login and this one",
        },
      });
    }

    // If not impossible but significantly far in a short time, you could log a soft event.
    if (distanceKm > 1000 && hoursSinceLast < 24) {
      return await SuspiciousEvent.create({
        user: userId,
        type: "new_location",
        riskScore: 25,
        severity: "medium",
        ip,
        userAgent,
        ...nowLocation,
        metadata: {
          email,
          distanceKm,
          hoursSinceLast,
          speedRequired,
          reason: "New distant login location detected",
        },
      });
    }

    // Normal-ish case: optionally update baseline as low risk
    return await SuspiciousEvent.create({
      user: userId,
      type: "new_location",
      riskScore: 5,
      severity: "low",
      ip,
      userAgent,
      ...nowLocation,
      metadata: {
        email,
        distanceKm,
        hoursSinceLast,
        speedRequired,
        reason: "New login location logged",
      },
    });
  } catch (err) {
    console.error("Impossible travel detection error:", err.message);
    return null;
  }
};
