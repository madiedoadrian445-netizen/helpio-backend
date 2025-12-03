// src/routes/client.routes.js
import express from "express";
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

// LIST + SEARCH + FILTER + PAGINATION
router.get("/", getClients);

// CREATE
router.post("/", createClient);

// SINGLE CLIENT
router.get("/:id", getClientById);

// UPDATE
router.patch("/:id", updateClient);

// ARCHIVE / UNARCHIVE
router.post("/:id/archive", archiveClient);
router.post("/:id/unarchive", unarchiveClient);

// DELETE (hard delete – optional)
router.delete("/:id", deleteClient);

// TIMELINE
router.post("/:id/timeline", addTimelineEntry);

export default router;
