// src/controllers/dev.controller.js
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { Provider } from "../models/Provider.js";

/* --------------------------------------------------------
   Helper: Generate access + refresh tokens
-------------------------------------------------------- */
const signToken = (id, expiresIn) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn });

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
       3. GENERATE TOKENS
    -------------------------------------------------------- */
    const accessToken = signToken(user._id, "7d");
    const refreshToken = signToken(user._id, "14d");

    /* --------------------------------------------------------
       4. ADD providerId TO USER PAYLOAD (like real login)
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
       5. RETURN SAME FORMAT AS REAL LOGIN
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
