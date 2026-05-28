import crypto from "crypto";
import express from "express";
import { ussdService } from "../services/ussd.service.js";
import { USSDRequest } from "../../shared/ussd-types.js";
import { logger } from '../logger.js';

const router = express.Router();

/**
 * USSD webhook endpoint for Africa's Talking
 * POST /api/ussd
 */
router.post("/", async (req, res) => {
  try {
    const { sessionId, serviceCode, phoneNumber, text } = req.body;

    // Validate request
    if (!sessionId || !phoneNumber) {
      return res.status(400).send("END Invalid request");
    }

    const ussdRequest: USSDRequest = {
      sessionId,
      serviceCode: serviceCode || "*384*96#",
      phoneNumber,
      text: text || "",
    };

    // Handle USSD request
    const response = await ussdService.handleUSSDRequest(ussdRequest);

    // Format response for Africa's Talking
    const prefix = response.continueSession ? "CON" : "END";
    res.set("Content-Type", "text/plain");
    res.send(`${prefix} ${response.text}`);
  } catch (error) {
    logger.error("USSD error:", error);
    res.status(500).send("END Service error. Please try again.");
  }
});

/**
 * Test endpoint for USSD simulation
 * POST /api/ussd/test
 */
router.post("/test", async (req, res) => {
  try {
    const { phoneNumber, text } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: "Phone number required" });
    }

    // Generate test session ID
    const sessionId = `test_${Date.now()}_${crypto.randomUUID().slice(0, 9)}`;

    const ussdRequest: USSDRequest = {
      sessionId,
      serviceCode: "*384*96#",
      phoneNumber,
      text: text || "",
    };

    const response = await ussdService.handleUSSDRequest(ussdRequest);

    res.json({
      sessionId,
      continueSession: response.continueSession,
      text: response.text,
    });
  } catch (error) {
    logger.error("USSD test error:", error);
    res.status(500).json({ error: "Service error" });
  }
});

export default router;
