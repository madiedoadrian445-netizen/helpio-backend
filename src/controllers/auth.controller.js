import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { Provider } from "../models/Provider.js";

import { detectImpossibleTravel } from "../utils/impossibleTravel.js";          // B22-A
import { recordDeviceFingerprint } from "../utils/deviceFingerprint.js";       // B22-B
import { analyzeIpReputationAndVelocity } from "../utils/ipReputation.js";     // B22-C
import { checkPasswordCompromised } from "../utils/compromisedPassword.js";    // ⭐ B22-E
import { SuspiciousEvent } from "../models/SuspiciousEvent.js";               // B22-E logging

/* ----------------------- TOKEN HELPERS ----------------------- */

const generateAccessToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1h",
  });
};

const generateRefreshToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  });
};

/* -------------------------- REGISTER -------------------------- */

export const register = async (req, res, next) => {
  try {
   const { name, email, password } = req.body;


    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Email already in use",
      });
    }

    /* ----------------------------------------------------------
       ⭐ B22-E — Compromised Password Detection
    ---------------------------------------------------------- */
    try {
      const result = await checkPasswordCompromised(password);

      if (result.compromised) {
        await SuspiciousEvent.create({
          user: null,
          type: "compromised_password",
          riskScore: result.score,
          severity: result.severity,
          ip: req.ip,
          userAgent: req.headers["user-agent"],
          metadata: {
            email: normalizedEmail,
            reason: result.reason,
            phase: "register",
            source: result.source,
          },
        });

        return res.status(400).json({
          success: false,
          message:
            "This password is too weak or appears in public breach lists. Please choose a stronger password.",
          reason: result.reason,
        });
      }
    } catch (err) {
      console.error("Compromised password check failed:", err.message);
    }
// ✅ Default role is CUSTOMER (not provider)
// 🔒 Public register ALWAYS creates CUSTOMER
const user = await User.create({
  name,
  email: normalizedEmail,
  password,
  role: "customer",
});



const accessToken = generateAccessToken(user._id);
const refreshToken = generateRefreshToken(user._id);

user.refreshToken = refreshToken;
await user.save();

return res.status(201).json({
  success: true,
  token: accessToken,
  refreshToken,
  user: {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    isVerifiedProvider: user.isVerifiedProvider,
  providerId: null, // ✅ customers never have providerId

  },
});

  } catch (err) {
    console.log("REGISTER ERROR:", err);
    next(err);
  }
};

/* --------------------------- LOGIN --------------------------- */

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const normalizedEmail = email.trim().toLowerCase();

    // ⭐ CRITICAL FIX: explicitly select password
    const user = await User.findOne({ email: normalizedEmail }).select(
      "+password"
    );

    if (!user || !(await user.matchPassword(password))) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);
    user.refreshToken = refreshToken;
    await user.save();

    const provider = await Provider.findOne({ user: user._id }).select("_id");

    /* ----------------------------------------------------------
       ⭐ Security Telemetry (non-blocking)
    ---------------------------------------------------------- */

    // B22-A Impossible Travel
    detectImpossibleTravel({
      userId: user._id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      email: user.email,
    }).catch((err) =>
      console.error("Impossible travel error:", err.message)
    );

    // B22-B Device Fingerprint
    recordDeviceFingerprint({
      userId: user._id,
      email: user.email,
      req,
    }).catch((err) =>
      console.error("Device fingerprint error:", err.message)
    );

    // B22-C IP Reputation & Velocity Engine
    analyzeIpReputationAndVelocity({
      userId: user._id,
      email: user.email,
      ip: req.ip,
    }).catch((err) =>
      console.error("IP reputation/velocity error:", err.message)
    );

    return res.json({
      success: true,
      token: accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerifiedProvider: user.isVerifiedProvider,
        providerId: provider?._id || null,
      },
    });
  } catch (err) {
    console.log("LOGIN ERROR:", err);
    next(err);
  }
};

/* --------------------------- GET ME --------------------------- */

export const getMe = async (req, res, next) => {
  try {
    const provider = await Provider.findOne({ user: req.user._id }).select("_id");

    return res.json({
      success: true,
      user: {
        _id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        isVerifiedProvider: req.user.isVerifiedProvider,
        providerId: provider?._id || null,
        createdAt: req.user.createdAt,
        updatedAt: req.user.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
};


/* ------------------------ REFRESH TOKEN ----------------------- */

export const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res
        .status(400)
        .json({ success: false, message: "Refresh token required" });
    }

    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET
    );

    const user = await User.findById(decoded.id);
    if (!user || user.refreshToken !== refreshToken) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid refresh token" });
    }

    const newAccessToken = generateAccessToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);
    user.refreshToken = newRefreshToken;
    await user.save();

    return res.json({
      success: true,
      token: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    next(err);
  }
};

/* --------------------------- LOGOUT --------------------------- */

export const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      try {
        const decoded = jwt.verify(
          refreshToken,
          process.env.JWT_REFRESH_SECRET
        );
        const user = await User.findById(decoded.id);
        if (user) {
          user.refreshToken = null;
          await user.save();
        }
      } catch {
        // ignore
      }
    }

    return res.json({ success: true, message: "Logged out" });
  } catch (err) {
    next(err);
  }

};


/* ---------------------- REGISTER PROVIDER ---------------------- */

export const registerProvider = async (req, res, next) => {
  try {
    const { name, email, password, companyName } = req.body;

    if (!name || !email || !password || !companyName) {
      return res.status(400).json({
        success: false,
        message: "Name, email, password, and company name are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Email already in use",
      });
    }

    /* ---------- Compromised password check ---------- */
    try {
      const result = await checkPasswordCompromised(password);

      if (result.compromised) {
        await SuspiciousEvent.create({
          user: null,
          type: "compromised_password",
          riskScore: result.score,
          severity: result.severity,
          ip: req.ip,
          userAgent: req.headers["user-agent"],
          metadata: {
            email: normalizedEmail,
            reason: result.reason,
            phase: "register_provider",
            source: result.source,
          },
        });

        return res.status(400).json({
          success: false,
          message:
            "This password is too weak or appears in public breach lists. Please choose a stronger password.",
        });
      }
    } catch (err) {
      console.error("Compromised password check failed:", err.message);
    }

    /* ---------- Create USER ---------- */
    const user = await User.create({
      name,
      email: normalizedEmail,
      password,
      role: "provider",
      isVerifiedProvider: false,
    });

    /* ---------- Create PROVIDER ---------- */
   const provider = await Provider.create({
  user: user._id,
  email: normalizedEmail,     // ✅ required by schema
  businessName: companyName,  // ✅ map correctly
});


    /* ---------- Tokens ---------- */
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    user.refreshToken = refreshToken;
    await user.save();

    return res.status(201).json({
      success: true,
      token: accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerifiedProvider: user.isVerifiedProvider,
        providerId: provider._id,
      },
    });
  } catch (err) {
    console.log("REGISTER PROVIDER ERROR:", err);
    next(err);
  }
};



  

