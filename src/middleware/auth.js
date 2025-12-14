// src/middleware/auth.js
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Provider } from "../models/Provider.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

/* -------------------------------------------------------
   AUTH PROTECTION MIDDLEWARE (HARDENED)
-------------------------------------------------------- */
export const protect = async (req, res, next) => {
  try {
    let token;

    // 1) Authorization header: Bearer <token>
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    // 2) Cookie fallback (Stripe Terminal compatibility)
    if (!token && req.cookies?.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authorized – missing token",
      });
    }

    // 3) Verify JWT
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    if (!decoded?.id || !isValidId(decoded.id)) {
      return res.status(401).json({
        success: false,
        message: "Invalid token payload",
      });
    }

    // 4) Load user
    const user = await User.findById(decoded.id).select(
      "-password -refreshToken"
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    // ⭐ 5) LOAD PROVIDER (THIS WAS MISSING)
    const provider = await Provider.findOne({ user: user._id }).select("_id");

    // 6) Attach enriched user
    req.user = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isVerifiedProvider: user.isVerifiedProvider,
      providerId: provider?._id || null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    req.userId = user._id;

    next();
  } catch (err) {
    console.error("❌ protect middleware error:", err);
    return res.status(401).json({
      success: false,
      message: "Not authorized",
    });
  }
};

/* -------------------------------------------------------
   ROLE-BASED ACCESS CONTROL
-------------------------------------------------------- */
export const requireRole = (roles = []) => {
  if (typeof roles === "string") roles = [roles];

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authorized – user missing",
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden – insufficient permissions",
      });
    }

    next();
  };
};

export const admin = requireRole("admin");
export const requireAdmin = admin;
