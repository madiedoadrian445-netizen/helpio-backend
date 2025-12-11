// src/routes/idempotencyRoutes.js

import express from "express";
import { protect } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

import {
  getAllIdempotencyKeys,
  getProviderIdempotencyKeys,
} from "../controllers/idempotencyController.js";

const router = express.Router();

/* -------------------------------------------------------
   PROVIDER-SCOPED IDEMPOTENCY RECORDS
   GET /api/idempotency/provider/me
------------------------------------------------------- */
router.get(
  "/provider/me",
  protect,
  getProviderIdempotencyKeys
);

/* -------------------------------------------------------
   ADMIN: GET ALL IDEMPOTENCY RECORDS
   GET /api/idempotency
   ⚠️ Requires req.user.isAdmin = true
------------------------------------------------------- */
router.get(
  "/",
  protect,
  getAllIdempotencyKeys
);

export default router;
