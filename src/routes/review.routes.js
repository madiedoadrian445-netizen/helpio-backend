// src/routes/review.routes.js

import express from "express";
import * as ctl from "../controllers/review.controller.js";
import auth from "../middleware/auth.js";

const router = express.Router();

// POST review
router.post("/", auth(true), ctl.addReview);

// GET reviews
router.get("/:serviceId", ctl.listForService);

// DELETE review
router.delete("/:id", auth(true), ctl.removeReview);

export default router;