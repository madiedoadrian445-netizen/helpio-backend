// src/routes/customerRoutes.js
import express from "express";
import { protect } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

import {
  createCustomer,
  getMyCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  searchCustomers,
} from "../controllers/customerController.js";

const router = express.Router();

/* -------------------------------------------------------
   CREATE + LIST (Provider scoped)
-------------------------------------------------------- */
router.post("/", protect, createCustomer);
router.get("/", protect, getMyCustomers);

/* -------------------------------------------------------
   SEARCH (must be BEFORE "/:id")
   GET /api/customers/search?q=John
-------------------------------------------------------- */
router.get("/search", protect, searchCustomers);

/* -------------------------------------------------------
   CRUD (Provider scoped)
-------------------------------------------------------- */
router.get("/:id", protect, validateObjectId("id"), getCustomerById);
router.put("/:id", protect, validateObjectId("id"), updateCustomer);
router.delete("/:id", protect, validateObjectId("id"), deleteCustomer);

export default router;
