// src/utils/authLogger.js
import { AuthEvent } from "../models/AuthEvent.js";

export const logAuthEvent = async ({
  user,
  email,
  type,
  ip,
  userAgent,
  metadata = {},
}) => {
  try {
    await AuthEvent.create({
      user: user || null,
      email: email || null,
      type,
      ip,
      userAgent,
      metadata,
    });
  } catch (err) {
    console.error("❌ Failed to write AuthEvent:", err.message);
  }
};

export const logPasswordReset = async (email, type, req, metadata = {}) =>
  logAuthEvent({
    email,
    type,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    metadata,
  });

export const logMFAEvent = async (user, email, type, req, metadata = {}) =>
  logAuthEvent({
    user,
    email,
    type,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    metadata,
  });
