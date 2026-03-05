import express from "express";
import * as ctl from "../controllers/review.controller.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.post("/", protect, ctl.addReview);
router.get("/eligible/:serviceId", protect, ctl.checkReviewEligibility);
router.get("/:serviceId", ctl.listForService);
router.delete("/:id", protect, ctl.removeReview);

export default router;