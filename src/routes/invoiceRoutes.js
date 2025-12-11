import express from "express";
import { protect } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";
import { providerRateLimiter } from "../middleware/providerRateLimiter.js";

import {
  createInvoice,
  getInvoiceById,
  getInvoicesForProvider,
  getInvoicesForCustomer,
  updateInvoice,
  deleteInvoice,
  payInvoiceNow,
  refundInvoice,
} from "../controllers/invoiceController.js";

const router = express.Router();

/* -------------------------------------------------------
   CREATE INVOICE
------------------------------------------------------- */
router.post(
  "/",
  protect,
  providerRateLimiter({
    windowMs: 60 * 1000,   // 1 min window
    max: 30,               // up to 30 invoice creations/min
    name: "invoice:create"
  }),
  createInvoice
);

/* -------------------------------------------------------
   GET ALL INVOICES FOR LOGGED-IN PROVIDER
   /api/invoices/provider/me
------------------------------------------------------- */
router.get("/provider/me", protect, getInvoicesForProvider);

/* -------------------------------------------------------
   GET ALL INVOICES FOR A SPECIFIC CUSTOMER
   /api/invoices/customer/:customerId
------------------------------------------------------- */
router.get(
  "/customer/:customerId",
  protect,
  validateObjectId("customerId"),
  getInvoicesForCustomer
);

/* -------------------------------------------------------
   ⭐ PAY INVOICE NOW (IDEMPOTENT)
   /api/invoices/:id/pay
------------------------------------------------------- */
router.post(
  "/:id/pay",
  protect,
  validateObjectId("id"),
  providerRateLimiter({
    windowMs: 60 * 1000,
    max: 50,
    name: "invoice:pay"
  }),
  payInvoiceNow
);

/* -------------------------------------------------------
   ⭐ REFUND INVOICE (IDEMPOTENT)
   /api/invoices/:id/refund
------------------------------------------------------- */
router.post(
  "/:id/refund",
  protect,
  validateObjectId("id"),
  providerRateLimiter({
    windowMs: 5 * 60 * 1000,   // 5 minute window
    max: 10,                   // max 10 refunds / 5 minutes
    name: "invoice:refund"
  }),
  refundInvoice
);

/* -------------------------------------------------------
   GET INVOICE BY ID
   /api/invoices/:id
------------------------------------------------------- */
router.get(
  "/:id",
  protect,
  validateObjectId("id"),
  getInvoiceById
);

/* -------------------------------------------------------
   UPDATE INVOICE
   /api/invoices/:id
------------------------------------------------------- */
router.put(
  "/:id",
  protect,
  validateObjectId("id"),
  updateInvoice
);

/* -------------------------------------------------------
   DELETE INVOICE
   /api/invoices/:id
------------------------------------------------------- */
router.delete(
  "/:id",
  protect,
  validateObjectId("id"),
  deleteInvoice
);

export default router;
