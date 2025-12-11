import express from "express";
import { protect, adminOnly } from "../middleware/auth.js";
import { updateFeeOverride } from "../controllers/adminProviderController.js";

const router = express.Router();

router.put("/:id/fee-override", protect, adminOnly, updateFeeOverride);

export default router;
