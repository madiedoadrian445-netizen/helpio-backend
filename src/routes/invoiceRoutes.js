import express from "express";
import { protect } from "../middleware/auth.js";
import { createInvoice } from "../controllers/invoiceController.js";

const router = express.Router();

router.post("/", protect, createInvoice);

export default router;
