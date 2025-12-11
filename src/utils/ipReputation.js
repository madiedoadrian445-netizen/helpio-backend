// src/utils/ipReputation.js
import geoip from "geoip-lite";
import { SuspiciousEvent } from "../models/SuspiciousEvent.js";
import { AuthEvent } from "../models/AuthEvent.js"; // assumes you created this in B21

// Simple private / local network detector (we skip these in prod reputation)
const isPrivateIp = (ip = "") => {
  if (!ip) return false;
  if (ip === "127.0.0.1" || ip === "::1") return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (ip.startsWith("172.")) {
    const second = parseInt(ip.split(".")[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
};

const parseListEnv = (value) =>
  (value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

/**
 * B22-C: IP Reputation & Login Velocity Engine
 *
 * Called after successful login.
 * - Looks at basic IP reputation (blocklists, local networks)
 * - Detects noisy IPs attacking many accounts
 * - Detects rapid login activity per user
 * - Emits SuspiciousEvent documents of type:
 *     - "ip_reputation"
 *     - "rapid_logins"
 */
export const analyzeIpReputationAndVelocity = async ({
  userId,
  email,
  ip,
}) => {
  try {
    if (!userId || !ip) return null;

    const now = new Date();

    const blockedIps = parseListEnv(process.env.HELPIO_IP_BLOCKLIST);
    const trustedIps = parseListEnv(process.env.HELPIO_IP_ALLOWLIST);

    let repScore = 0;
    const repReasons = [];

    // 1) Local/dev IPs → skip heavy reputation (likely dev/test)
    if (isPrivateIp(ip)) {
      repReasons.push("Private / local network IP (dev/test)");
    } else {
      // a) Explicit blocklist
      if (blockedIps.includes(ip)) {
        repScore += 80;
        repReasons.push("IP explicitly listed in HELPIO_IP_BLOCKLIST");
      }

      // b) Explicit allowlist lowers risk
      if (trustedIps.includes(ip)) {
        repScore -= 20;
        repReasons.push("IP explicitly listed in HELPIO_IP_ALLOWLIST");
      }

      // c) Geo heuristics
      const lookup = geoip.lookup(ip);
      if (!lookup) {
        repScore += 10;
        repReasons.push("Unknown GeoIP location");
      } else {
        const { country } = lookup;
        // Example: if you only operate in US/CA at launch,
        // other countries are slightly more suspicious.
        const primaryCountries = parseListEnv(
          process.env.HELPIO_PRIMARY_COUNTRIES || "US,CA"
        );

        if (!primaryCountries.includes(country)) {
          repScore += 15;
          repReasons.push(
            `Login from non-primary country: ${country || "UNKNOWN"}`
          );
        }
      }
    }

    // Clamp repScore
    if (repScore < 0) repScore = 0;
    if (repScore > 100) repScore = 100;

    // 2) Velocity per IP (global)
    // How many accounts has this IP touched recently?
    const ipWindowMinutes = parseInt(
      process.env.HELPIO_IP_VELOCITY_WINDOW_MINUTES || "15",
      10
    );
    const ipWindowStart = new Date(
      now.getTime() - ipWindowMinutes * 60 * 1000
    );

    let ipVelocityScore = 0;
    let ipVelocityReasons = [];

    try {
      const recentAuthForIp = await AuthEvent.find({
        ip,
        createdAt: { $gte: ipWindowStart },
      })
        .select("user eventType createdAt")
        .lean();

      const uniqueUsers = new Set(
        recentAuthForIp.map((e) => String(e.user || "anon"))
      );

      const totalEvents = recentAuthForIp.length;
      const totalUsers = uniqueUsers.size;

      if (totalEvents >= 20) {
        ipVelocityScore += 40;
        ipVelocityReasons.push(
          `High number of auth events from this IP in ${ipWindowMinutes} minutes (${totalEvents} events)`
        );
      } else if (totalEvents >= 10) {
        ipVelocityScore += 20;
        ipVelocityReasons.push(
          `Elevated number of auth events from this IP in ${ipWindowMinutes} minutes (${totalEvents} events)`
        );
      }

      if (totalUsers >= 5) {
        ipVelocityScore += 30;
        ipVelocityReasons.push(
          `IP used by many different accounts in a short window (${totalUsers} users)`
        );
      } else if (totalUsers >= 3) {
        ipVelocityScore += 15;
        ipVelocityReasons.push(
          `IP shared among several accounts in a short window (${totalUsers} users)`
        );
      }
    } catch (err) {
      console.error("IP velocity query error:", err.message);
    }

    if (ipVelocityScore > 100) ipVelocityScore = 100;

    // 3) Velocity per USER (this account)
    const userWindowMinutes = parseInt(
      process.env.HELPIO_USER_VELOCITY_WINDOW_MINUTES || "10",
      10
    );
    const userWindowStart = new Date(
      now.getTime() - userWindowMinutes * 60 * 1000
    );

    let userVelocityScore = 0;
    let userVelocityReasons = [];

    try {
      const recentUserAuth = await AuthEvent.find({
        user: userId,
        createdAt: { $gte: userWindowStart },
      })
        .select("ip eventType createdAt")
        .lean();

      const totalEvents = recentUserAuth.length;
      const uniqueIps = new Set(recentUserAuth.map((e) => e.ip || ""));

      if (totalEvents >= 15) {
        userVelocityScore += 35;
        userVelocityReasons.push(
          `High number of auth events for this account in ${userWindowMinutes} minutes (${totalEvents} events)`
        );
      } else if (totalEvents >= 8) {
        userVelocityScore += 20;
        userVelocityReasons.push(
          `Elevated number of auth events for this account in ${userWindowMinutes} minutes (${totalEvents} events)`
        );
      }

      if (uniqueIps.size >= 4) {
        userVelocityScore += 30;
        userVelocityReasons.push(
          `Account logging in from many different IPs in a short time (${uniqueIps.size} IPs)`
        );
      } else if (uniqueIps.size >= 2) {
        userVelocityScore += 15;
        userVelocityReasons.push(
          `Account logging in from multiple IPs in a short time (${uniqueIps.size} IPs)`
        );
      }
    } catch (err) {
      console.error("User velocity query error:", err.message);
    }

    if (userVelocityScore > 100) userVelocityScore = 100;

    /* -------------------------------------------------------
       Emit SuspiciousEvents when scores are meaningful
    -------------------------------------------------------- */

    const events = [];

    // IP reputation event
    if (repScore >= 30) {
      const severity =
        repScore >= 80
          ? "critical"
          : repScore >= 60
          ? "high"
          : repScore >= 40
          ? "medium"
          : "low";

      const geo = geoip.lookup(ip) || {};
      const [lat, lon] = geo.ll || [];

      const evt = await SuspiciousEvent.create({
        user: userId,
        type: "ip_reputation",
        riskScore: repScore,
        severity,
        ip,
        country: geo.country,
        city: geo.city,
        region: geo.region,
        lat,
        lon,
        metadata: {
          email,
          reasons: repReasons,
        },
      });

      events.push(evt);
    }

    // Rapid login / velocity anomaly event
    const combinedVelocity = Math.min(
      100,
      ipVelocityScore + userVelocityScore
    );
    if (combinedVelocity >= 30) {
      const severity =
        combinedVelocity >= 80
          ? "critical"
          : combinedVelocity >= 60
          ? "high"
          : combinedVelocity >= 40
          ? "medium"
          : "low";

      const evt = await SuspiciousEvent.create({
        user: userId,
        type: "rapid_logins",
        riskScore: combinedVelocity,
        severity,
        ip,
        metadata: {
          email,
          ipVelocityScore,
          userVelocityScore,
          ipVelocityReasons,
          userVelocityReasons,
          ipWindowMinutes,
          userWindowMinutes,
        },
      });

      events.push(evt);
    }

    return {
      repScore,
      ipVelocityScore,
      userVelocityScore,
      eventsCount: events.length,
    };
  } catch (err) {
    console.error("IP reputation / velocity engine error:", err.message);
    return null;
  }
};
