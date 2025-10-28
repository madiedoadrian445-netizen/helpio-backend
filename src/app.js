// src/app.js

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.routes.js";
import serviceRoutes from "./routes/service.routes.js";

// Load environment variables
dotenv.config();

const app = express();

// =======================
// Middleware
// =======================
app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(morgan("dev"));

// Rate limiter (security)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per window
});
app.use(limiter);

// =======================
// MongoDB Connection
// =======================
mongoose
  .connect(process.env.MONGO_URI, {
    // deprecated options are harmless for now
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err.message));

// =======================
// Routes
// =======================

// Auth routes (register / login)
app.use("/api/auth", authRoutes);

// Services routes (feed + create)
app.use("/api/services", serviceRoutes);

// Health check route for Render
app.get("/api/health", (req, res) => {
  res.status(200).send("OK");
});

// Root route
app.get("/", (req, res) => {
  res.send("Helpio Backend API is running...");
});

// =======================
// Export app
// =======================
export default app;
