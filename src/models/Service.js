// src/models/Service.js
import mongoose from "mongoose";

const serviceSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: false }, // 👈 made optional
    price: { type: Number, required: true },
    category: { type: String },
    location: { type: String },
    photos: [{ type: String }],
  },
  { timestamps: true }
);

export default mongoose.model("Service", serviceSchema);
