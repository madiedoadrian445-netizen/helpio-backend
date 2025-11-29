// src/middleware/auth.js
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";

export const protect = async (req, res, next) => {
  let token;

  // Look for token in Authorization header: "Bearer xxx"
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = await User.findById(decoded.id).select("-password -refreshToken");

      if (!req.user) {
        return res
          .status(401)
          .json({ success: false, message: "User not found" });
      }

      return next();
    } catch (err) {
      console.error("Auth error:", err.message);
      return res
        .status(401)
        .json({ success: false, message: "Not authorized, token failed" });
    }
  }

  return res
    .status(401)
    .json({ success: false, message: "Not authorized, no token" });
};

export const requireRole = (roles = []) => {
  if (typeof roles === "string") roles = [roles];

  return (req, res, next) => {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "Not authorized, no user" });
    }

    if (!roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ success: false, message: "Forbidden: insufficient permissions" });
    }

    next();
  };
};
