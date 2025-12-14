// src/middleware/validateObjectId.js
import mongoose from "mongoose";

export const validateObjectId = (paramName = "id") => {
  return (req, res, next) => {
    const value = req.params?.[paramName];

    // Must exist AND be a string
    if (!value || typeof value !== "string") {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(value)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID",
      });
    }

    next();
  };
};
