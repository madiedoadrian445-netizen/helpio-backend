// src/controllers/dev.controller.js
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";

export const devLogin = async (req, res) => {
  try {
    // look for an existing dev user
    let user = await User.findOne({ email: "dev@helpio.com" });

    if (!user) {
      // create dev user ONLY if not existing
      user = await User.create({
        name: "Dev User",
        email: "dev@helpio.com",
        password: "devpassword123", // hashed by User model pre-save hook
        role: "provider",
      });
    }

    // sign JWT
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      success: true,
      message: "Dev login successful",
      token,
      user,
    });
  } catch (err) {
    console.log("DEV LOGIN ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Dev login failed",
      error: err.message,
    });
  }
};
