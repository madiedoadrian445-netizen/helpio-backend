// src/controllers/dev.controller.js
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { Provider } from "../models/Provider.js";

/* --------------------------------------------------------
   SIGN JWT (NOW includes providerId!)
-------------------------------------------------------- */
const signToken = (payload, expiresIn) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });

export const devLogin = async (req, res) => {
  try {
    /* --------------------------------------------------------
       1. FIND OR CREATE DEV USER
    -------------------------------------------------------- */
    let user = await User.findOne({ email: "dev@helpio.com" });

    if (!user) {
      user = await User.create({
        name: "Dev User",
        email: "dev@helpio.com",
        password: "devpassword123",
        role: "provider",
      });
    }

    /* --------------------------------------------------------
       2. FIND OR CREATE PROVIDER PROFILE
    -------------------------------------------------------- */
    let provider = await Provider.findOne({ user: user._id });

    if (!provider) {
      provider = await Provider.create({
        user: user._id,
        businessName: "Dev Provider LLC",
        phone: "000-000-0000",
        address: "Dev Street",
        description: "Auto-generated dev provider",
        servicesOffered: [],
      });
    }

    /* --------------------------------------------------------
       3. JWT PAYLOAD (THIS is the ACTUAL fix)
    -------------------------------------------------------- */
    const jwtPayload = {
      id: user._id,
      providerId: provider._id,       // ⭐ REQUIRED ⭐
      role: user.role,
    };

    /* --------------------------------------------------------
       4. GENERATE TOKENS (with providerId inside)
    -------------------------------------------------------- */
    const accessToken = signToken(jwtPayload, "7d");
    const refreshToken = signToken(jwtPayload, "14d");

    /* --------------------------------------------------------
       5. USER PAYLOAD FOR FRONTEND (display)
    -------------------------------------------------------- */
    const userPayload = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      providerId: provider._id,
      isVerifiedProvider: provider.isVerified || false,
    };

    /* --------------------------------------------------------
       6. SEND RESPONSE
    -------------------------------------------------------- */
    return res.json({
      success: true,
      token: accessToken,
      refreshToken,
      user: userPayload,
    });

  } catch (err) {
    console.log("❌ DEV LOGIN ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Dev login failed",
      error: err.message,
    });
  }
};
