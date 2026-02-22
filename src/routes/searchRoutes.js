import express from "express";
import { suggestSearch } from "../controllers/searchController.js";

const router = express.Router();

router.get("/suggest", suggestSearch);

export default router;