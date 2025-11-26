// src/controllers/auth.controller.js
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { Provider } from "../models/Provider.js";

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
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required",
      });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Email already in use",
      });
    }

    // Create user (default to provider)
    const user = await User.create({
      name,
      email,
      password,
      role: role || "provider",
    });

    // 🔥 Auto-create Provider profile linked to this user
    const provider = await Provider.create({
      user: user._id,
      businessName: name,
      email,
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
        providerId: provider._id,
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

    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password))) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    user.refreshToken = refreshToken;
    await user.save();

    // Optional: look up provider profile (if exists)
    const provider = await Provider.findOne({ user: user._id }).select("_id");

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
    // req.user is set in protect middleware
    return res.json({
      success: true,
      user: req.user,
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
      } catch (err) {
        // ignore token errors on logout
      }
    }

    return res.json({ success: true, message: "Logged out" });
  } catch (err) {
    next(err);
  }
};
