// src/server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import { connectDB } from "./config/db.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

/* -------------------- Import Routes -------------------- */
import authRoutes from "./routes/auth.routes.js";
import providerRoutes from "./routes/providerRoutes.js";   // ✅ FIXED
import listingRoutes from "./routes/listingRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import customerRoutes from "./routes/customerRoutes.js";
import customerTimelineRoutes from "./routes/customerTimelineRoutes.js";
import invoiceRoutes from "./routes/invoiceRoutes.js";

/* -------------------- Initialize App -------------------- */
const app = express();

/* -------------------- REQUIRED FOR RENDER + CLOUDFLARE -------------------- */
app.enable("trust proxy");

/* -------------------- Core Middleware -------------------- */
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "*",
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

/* -------------------- Health Check -------------------- */
app.get("/", (req, res) => {
  res.send("✅ Helpio backend is live");
});

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

/* -------------------- API Routes -------------------- */
app.use("/api/auth", authRoutes);
app.use("/api/providers", providerRoutes);
app.use("/api/listings", listingRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/customers/timeline", customerTimelineRoutes);
app.use("/api/invoices", invoiceRoutes);

/* -------------------- Error Handling -------------------- */
app.use(notFound);
app.use(errorHandler);

/* -------------------- Start Server -------------------- */
const PORT = process.env.PORT || 10000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Helpio API running on port ${PORT}`);
  });
});
