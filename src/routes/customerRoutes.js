// src/routes/customerRoutes.js
import express from "express";
import {
  createCustomer,
  getMyCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
} from "../controllers/customerController.js";

import { protect } from "../middleware/auth.js";

const router = express.Router();

router.post("/", protect, createCustomer);
router.get("/", protect, getMyCustomers);
router.get("/:id", protect, getCustomerById);
router.put("/:id", protect, updateCustomer);
router.delete("/:id", protect, deleteCustomer);

export default router;
