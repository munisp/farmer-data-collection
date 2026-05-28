import express from "express";
import { smsService } from "../services/sms.service.js";
import { SMSMessage } from "../../shared/sms-types.js";
import { getDb } from "../db.js";
import { messageLogs } from "../../drizzle/schema.js";
import { eq } from "drizzle-orm";
import { logger } from '../logger.js';

const router = express.Router();

/**
 * Update SMS status in database
 */
async function updateSMSStatus(
  messageId: string,
  status: string,
  networkCode?: string
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    await db.update(messageLogs)
      .set({
        status,
        networkCode: networkCode || null,
        updatedAt: new Date(),
      })
      .where(eq(messageLogs.externalMessageId, messageId));

    logger.info(`[SMS] Updated message ${messageId} status to ${status}`);
  } catch (error) {
    logger.error('[SMS] Failed to update message status:', error);
  }
}

/**
 * Save incoming SMS to database
 */
async function saveIncomingSMS(
  from: string,
  to: string,
  text: string,
  externalMessageId: string
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    await db.insert(messageLogs).values({
      phoneNumber: from,
      channel: 'sms',
      direction: 'inbound',
      messageText: text,
      externalMessageId,
      status: 'received',
    });

    logger.info(`[SMS] Saved incoming message from ${from}`);
  } catch (error) {
    logger.error('[SMS] Failed to save incoming message:', error);
  }
}

/**
 * Send SMS
 * POST /api/sms/send
 */
router.post("/send", async (req, res) => {
  try {
    const { to, message, from, provider } = req.body;

    if (!to || !message) {
      return res.status(400).json({ error: "Missing required fields: to, message" });
    }

    const smsMessage: SMSMessage = { to, message, from };
    const result = await smsService.sendSMS(smsMessage, provider);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error: unknown) {
    logger.error("[SMS API] Send error:", error);
    res.status(500).json({ error: (error instanceof Error ? error.message : String(error)) });
  }
});

/**
 * Send templated SMS
 * POST /api/sms/send-template
 */
router.post("/send-template", async (req, res) => {
  try {
    const { to, templateId, variables, provider } = req.body;

    if (!to || !templateId || !variables) {
      return res.status(400).json({ 
        error: "Missing required fields: to, templateId, variables" 
      });
    }

    const result = await smsService.sendTemplatedSMS(to, templateId, variables, provider);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error: unknown) {
    logger.error("[SMS API] Template send error:", error);
    res.status(500).json({ error: (error instanceof Error ? error.message : String(error)) });
  }
});

/**
 * Send bulk SMS
 * POST /api/sms/send-bulk
 */
router.post("/send-bulk", async (req, res) => {
  try {
    const { messages, provider } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages must be an array" });
    }

    const results = await smsService.sendBulkSMS(messages, provider);
    
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    res.json({
      total: results.length,
      success: successCount,
      failed: failureCount,
      results,
    });
  } catch (error: unknown) {
    logger.error("[SMS API] Bulk send error:", error);
    res.status(500).json({ error: (error instanceof Error ? error.message : String(error)) });
  }
});

/**
 * Get SMS service status
 * GET /api/sms/status
 */
router.get("/status", async (req, res) => {
  try {
    const available = smsService.isAvailable();
    const providers = smsService.getAvailableProviders();

    res.json({
      available,
      providers,
      configured: providers.length > 0,
    });
  } catch (error: unknown) {
    logger.error("[SMS API] Status error:", error);
    res.status(500).json({ error: (error instanceof Error ? error.message : String(error)) });
  }
});

/**
 * Webhook for SMS delivery reports (Africa's Talking)
 * POST /api/sms/delivery-report
 */
router.post("/delivery-report", async (req, res) => {
  try {
    const { id, status, phoneNumber, networkCode, retryCount } = req.body;

    logger.info("[SMS] Delivery report:", {
      id,
      status,
      phoneNumber,
      networkCode,
      retryCount,
    });

    // Update SMS notification status in database
    await updateSMSStatus(id, status, networkCode);
    
    res.status(200).send("OK");
  } catch (error: unknown) {
    logger.error("[SMS API] Delivery report error:", error);
    res.status(500).json({ error: (error instanceof Error ? error.message : String(error)) });
  }
});

/**
 * Webhook for incoming SMS (Africa's Talking)
 * POST /api/sms/incoming
 */
router.post("/incoming", async (req, res) => {
  try {
    const { from, to, text, date, id, linkId } = req.body;

    logger.info("[SMS] Incoming message:", {
      from,
      to,
      text,
      date,
      id,
      linkId,
    });

    // Save incoming SMS to database for processing
    await saveIncomingSMS(from, to, text, id);
    
    res.status(200).send("OK");
  } catch (error: unknown) {
    logger.error("[SMS API] Incoming SMS error:", error);
    res.status(500).json({ error: (error instanceof Error ? error.message : String(error)) });
  }
});

export default router;
