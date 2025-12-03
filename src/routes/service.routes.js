// src/routes/service.routes.js
import express from "express";
import { createService, getAllServices } from "../controllers/service.controller.js";
const router = express.Router();

router.get("/", getAllServices);
router.post("/", createService);

export default router;
