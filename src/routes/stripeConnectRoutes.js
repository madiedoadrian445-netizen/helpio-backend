import express from "express";
import { createConnectedAccount } from "../controllers/stripeConnectController.js";

const router = express.Router();

router.post("/connect/create-account", createConnectedAccount);

export default router;