// src/routes/review.routes.js

import express from "express";
import * as ctl from "../controllers/review.controller.js";
import * as authMiddleware from "../middleware/auth.js";

const router = express.Router();

router.post("/", authMiddleware.auth(true), ctl.addReview);
router.get("/:serviceId", ctl.listForService);
router.delete("/:id", authMiddleware.auth(true), ctl.removeReview);

export default router;