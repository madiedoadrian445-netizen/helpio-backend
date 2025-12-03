import express from "express";
import { protect } from "../middleware/auth.js";
import {
  createInvoice,
  getInvoiceById,
  getInvoicesForProvider,
  getInvoicesForCustomer,
  updateInvoice,
  deleteInvoice,
} from "../controllers/invoiceController.js";

const router = express.Router();

/* -------------------------------------------------------
   CREATE INVOICE (Already Working)
------------------------------------------------------- */
router.post("/", protect, createInvoice);

/* -------------------------------------------------------
   GET INVOICE BY ID
   /api/invoices/:id
------------------------------------------------------- */
router.get("/:id", protect, getInvoiceById);

/* -------------------------------------------------------
   GET ALL INVOICES FOR LOGGED-IN PROVIDER
   /api/invoices/provider/me
------------------------------------------------------- */
router.get("/provider/me", protect, getInvoicesForProvider);

/* -------------------------------------------------------
   GET ALL INVOICES FOR A SPECIFIC CUSTOMER
   /api/invoices/customer/:customerId
------------------------------------------------------- */
router.get("/customer/:customerId", protect, getInvoicesForCustomer);

/* -------------------------------------------------------
   UPDATE INVOICE
   /api/invoices/:id
------------------------------------------------------- */
router.put("/:id", protect, updateInvoice);

/* -------------------------------------------------------
   DELETE INVOICE
   /api/invoices/:id
------------------------------------------------------- */
router.delete("/:id", protect, deleteInvoice);

export default router;
