// src/utils/deviceFingerprint.js
import crypto from "crypto";
import { DeviceFingerprint } from "../models/DeviceFingerprint.js";
import { SuspiciousEvent } from "../models/SuspiciousEvent.js";

const buildFingerprintFromRequest = (req) => {
  const userAgent = req.headers["user-agent"] || "";
  const acceptLanguage = req.headers["accept-language"] || "";
  const secChUa = req.headers["sec-ch-ua"] || "";
  const secChUaPlatform = req.headers["sec-ch-ua-platform"] || "";

  const raw = [userAgent, acceptLanguage, secChUa, secChUaPlatform].join("|");

  const fingerprintId = crypto
    .createHash("sha256")
    .update(raw)
    .digest("hex");

  return {
    fingerprintId,
    userAgent,
    acceptLanguage,
    secChUa,
    secChUaPlatform,
  };
};

export const recordDeviceFingerprint = async ({ userId, email, req }) => {
  try {
    if (!userId || !req) return null;

    const ip = req.ip;
    const {
      fingerprintId,
      userAgent,
      acceptLanguage,
      secChUa,
      secChUaPlatform,
    } = buildFingerprintFromRequest(req);

    let device = await DeviceFingerprint.findOne({
      user: userId,
      fingerprintId,
    });

    if (!device) {
      const existingCount = await DeviceFingerprint.countDocuments({
        user: userId,
      });

      const isFirstDevice = existingCount === 0;

      device = await DeviceFingerprint.create({
        user: userId,
        fingerprintId,
        userAgent,
        acceptLanguage,
        secChUa,
        secChUaPlatform,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        timesSeen: 1,
        ipFirst: ip || "",
        ipLast: ip || "",
        ipSamples: ip ? [ip] : [],
        isTrusted: isFirstDevice,
      });

      const riskScore = isFirstDevice
        ? 10
        : existingCount >= 3
        ? 70
        : 40;

      const severity =
        riskScore >= 80
          ? "critical"
          : riskScore >= 60
          ? "high"
          : riskScore >= 40
          ? "medium"
          : "low";

      await SuspiciousEvent.create({
        user: userId,
        type: "new_device",
        riskScore,
        severity,
        ip,
        userAgent,
        metadata: {
          email,
          fingerprintId,
          existingDeviceCount: existingCount,
          acceptLanguage,
          secChUa,
          secChUaPlatform,
          reason: "New device/browser fingerprint seen for this user",
        },
      });

      return {
        fingerprintId,
        deviceId: device._id,
        isNewDevice: true,
        riskScore,
        severity,
      };
    }

    // Existing device → update telemetry
    device.lastSeenAt = new Date();
    device.timesSeen += 1;
    device.ipLast = ip || device.ipLast;

    if (ip) {
      const samples = new Set(device.ipSamples || []);
      samples.add(ip);
      device.ipSamples = Array.from(samples).slice(-10);
    }

    await device.save();

    return {
      fingerprintId,
      deviceId: device._id,
      isNewDevice: false,
      isTrusted: device.isTrusted,
    };
  } catch (err) {
    console.error("Device fingerprint tracking error:", err.message);
    return null;
  }
};
