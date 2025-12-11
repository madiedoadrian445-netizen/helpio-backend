// src/routes/refundRoutes.js
import express from "express";
import { protect } from "../middleware/auth.js";
import {
  refundInvoice,
  refundSubscription,
} from "../controllers/refundController.js";

const router = express.Router();

/**
 * All refund routes are provider-scoped via `protect`.
 * You can also add role checks if you have admin flags.
 */

router.post("/invoice", protect, refundInvoice);
router.post("/subscription", protect, refundSubscription);

export default router;
