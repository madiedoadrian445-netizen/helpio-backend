// src/routes/review.routes.js

import express from "express";
import * as ctl from "../controllers/review.controller.js";
import { auth } from "../middleware/auth.js";

const router = express.Router();

// POST   /api/reviews (user)
router.post("/", auth(true), ctl.addReview);

// GET    /api/reviews/:serviceId (public)
router.get("/:serviceId", ctl.listForService);

// DELETE /api/reviews/:id (owner)
router.delete("/:id", auth(true), ctl.removeReview);

export default router;