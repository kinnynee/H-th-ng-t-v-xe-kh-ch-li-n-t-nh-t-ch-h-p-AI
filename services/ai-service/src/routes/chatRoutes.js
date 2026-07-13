import { Router } from "express";
import { chat } from "../controllers/chatController.js";
import { healthCheck } from "../controllers/health.js";

const router = Router();

/** GET /health — Health check endpoint */
router.get("/health", healthCheck);

/** POST /chat — Chat endpoint chính */
router.post("/chat", chat);

export default router;
