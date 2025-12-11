// src/routes/client.routes.js
import express from "express";
import { protect } from "../middleware/auth.js";
import { validateObjectId } from "../middleware/validateObjectId.js";

import {
  createClient,
  getClients,
  getClientById,
  updateClient,
  archiveClient,
  unarchiveClient,
  deleteClient,
  addTimelineEntry,
} from "../controllers/client.controller.js";

const router = express.Router();

/* -------------------------------------------------------
   ALL CRM ROUTES REQUIRE AUTHENTICATION
-------------------------------------------------------- */
router.use(protect);

/* -------------------------------------------------------
   LIST + SEARCH + FILTER + PAGINATION
   GET /clients
-------------------------------------------------------- */
router.get("/", getClients);

/* -------------------------------------------------------
   CREATE CLIENT
   POST /clients
-------------------------------------------------------- */
router.post("/", createClient);

/* -------------------------------------------------------
   GET SINGLE CLIENT
   GET /clients/:id
-------------------------------------------------------- */
router.get("/:id", validateObjectId("id"), getClientById);

/* -------------------------------------------------------
   UPDATE CLIENT
   PATCH /clients/:id
-------------------------------------------------------- */
router.patch("/:id", validateObjectId("id"), updateClient);

/* -------------------------------------------------------
   ARCHIVE / UNARCHIVE
   POST /clients/:id/archive
   POST /clients/:id/unarchive
-------------------------------------------------------- */
router.post("/:id/archive", validateObjectId("id"), archiveClient);
router.post("/:id/unarchive", validateObjectId("id"), unarchiveClient);

/* -------------------------------------------------------
   DELETE CLIENT (hard delete)
   DELETE /clients/:id
-------------------------------------------------------- */
router.delete("/:id", validateObjectId("id"), deleteClient);

/* -------------------------------------------------------
   TIMELINE ENTRY
   POST /clients/:id/timeline
-------------------------------------------------------- */
router.post(
  "/:id/timeline",
  validateObjectId("id"),
  addTimelineEntry
);

export default router;
