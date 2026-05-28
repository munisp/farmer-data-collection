import express from "express";
import { whatsappService } from "../services/whatsapp.service.js";
import { WhatsAppMessage } from "../../shared/whatsapp-types.js";
import { getDb } from "../db.js";
import { messageLogs } from "../../drizzle/schema.js";
import { eq } from "drizzle-orm";
import { logger } from '../logger.js';

const router = express.Router();

/**
 * Update message status in database
 */
async function updateMessageStatus(
  messageId: string,
  status: string,
  errorCode?: string,
  errorMessage?: string
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    await db.update(messageLogs)
      .set({
        status,
        errorCode: errorCode || null,
        errorMessage: errorMessage || null,
        updatedAt: new Date(),
      })
      .where(eq(messageLogs.externalMessageId, messageId));

    logger.info(`[WhatsApp] Updated message ${messageId} status to ${status}`);
  } catch (error) {
    logger.error('[WhatsApp] Failed to update message status:', error);
  }
}

/**
 * Save incoming message to database
 */
async function saveIncomingMessage(
  from: string,
  messageType: string,
  content: string,
  externalMessageId: string
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    await db.insert(messageLogs).values({
      phoneNumber: from,
      channel: 'whatsapp',
      direction: 'inbound',
      messageText: content,
      messageData: { type: messageType },
      externalMessageId,
      status: 'received',
    });

    logger.info(`[WhatsApp] Saved incoming message from ${from}`);
  } catch (error) {
    logger.error('[WhatsApp] Failed to save incoming message:', error);
  }
}

/**
 * Send WhatsApp message
 * POST /api/whatsapp/send
 */
router.post("/send", async (req, res) => {
  try {
    const { to, type, text, template, image, document, location, provider } = req.body;

    if (!to || !type) {
      return res.status(400).json({ error: "Missing required fields: to, type" });
    }

    const message: WhatsAppMessage = {
      to,
      type,
      text,
      template,
      image,
      document,
      location,
    };

    const result = await whatsappService.sendMessage(message, provider);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error: unknown) {
    logger.error("[WhatsApp API] Send error:", error);
    res.status(500).json({ error: (error instanceof Error ? error.message : String(error)) });
  }
});

/**
 * Send text message
 * POST /api/whatsapp/send-text
 */
router.post("/send-text", async (req, res) => {
  try {
    const { to, text, provider } = req.body;

    if (!to || !text) {
      return res.status(400).json({ error: "Missing required fields: to, text" });
    }

    const result = await whatsappService.sendTextMessage(to, text, provider);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error: unknown) {
    logger.error("[WhatsApp API] Send text error:", error);
    res.status(500).json({ error: (error instanceof Error ? error.message : String(error)) });
  }
});

/**
 * Send template message
 * POST /api/whatsapp/send-template
 */
router.post("/send-template", async (req, res) => {
  try {
    const { to, templateName, parameters, provider } = req.body;

    if (!to || !templateName || !parameters) {
      return res.status(400).json({
        error: "Missing required fields: to, templateName, parameters",
      });
    }

    const result = await whatsappService.sendTemplateMessage(
      to,
      templateName,
      parameters,
      provider
    );

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error: unknown) {
    logger.error("[WhatsApp API] Send template error:", error);
    res.status(500).json({ error: (error instanceof Error ? error.message : String(error)) });
  }
});

/**
 * Send image message
 * POST /api/whatsapp/send-image
 */
router.post("/send-image", async (req, res) => {
  try {
    const { to, imageUrl, caption, provider } = req.body;

    if (!to || !imageUrl) {
      return res.status(400).json({ error: "Missing required fields: to, imageUrl" });
    }

    const result = await whatsappService.sendImageMessage(to, imageUrl, caption, provider);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error: unknown) {
    logger.error("[WhatsApp API] Send image error:", error);
    res.status(500).json({ error: (error instanceof Error ? error.message : String(error)) });
  }
});

/**
 * Send document message
 * POST /api/whatsapp/send-document
 */
router.post("/send-document", async (req, res) => {
  try {
    const { to, documentUrl, filename, caption, provider } = req.body;

    if (!to || !documentUrl) {
      return res.status(400).json({ error: "Missing required fields: to, documentUrl" });
    }

    const result = await whatsappService.sendDocumentMessage(
      to,
      documentUrl,
      filename,
      caption,
      provider
    );

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error: unknown) {
    logger.error("[WhatsApp API] Send document error:", error);
    res.status(500).json({ error: (error instanceof Error ? error.message : String(error)) });
  }
});

/**
 * Send location message
 * POST /api/whatsapp/send-location
 */
router.post("/send-location", async (req, res) => {
  try {
    const { to, latitude, longitude, name, address, provider } = req.body;

    if (!to || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        error: "Missing required fields: to, latitude, longitude",
      });
    }

    const result = await whatsappService.sendLocationMessage(
      to,
      latitude,
      longitude,
      name,
      address,
      provider
    );

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error: unknown) {
    logger.error("[WhatsApp API] Send location error:", error);
    res.status(500).json({ error: (error instanceof Error ? error.message : String(error)) });
  }
});

/**
 * Get WhatsApp service status
 * GET /api/whatsapp/status
 */
router.get("/status", async (req, res) => {
  try {
    const available = whatsappService.isAvailable();
    const providers = whatsappService.getAvailableProviders();

    res.json({
      available,
      providers,
      configured: providers.length > 0,
    });
  } catch (error: unknown) {
    logger.error("[WhatsApp API] Status error:", error);
    res.status(500).json({ error: (error instanceof Error ? error.message : String(error)) });
  }
});

/**
 * Webhook for incoming WhatsApp messages (Meta)
 * POST /api/whatsapp/webhook
 */
router.post("/webhook", async (req, res) => {
  try {
    const { entry } = req.body;

    if (!entry || !entry[0]?.changes) {
      return res.status(400).json({ error: "Invalid webhook payload" });
    }

    const changes = entry[0].changes;
    
    for (const change of changes) {
      if (change.value?.messages) {
        for (const message of change.value.messages) {
          logger.info("[WhatsApp] Incoming message:", {
            from: message.from,
            type: message.type,
            timestamp: message.timestamp,
            text: message.text?.body,
          });

          // Save incoming message to database
          const content = message.text?.body || 
                         message.image?.caption || 
                         message.document?.caption || 
                         `[${message.type}]`;
          await saveIncomingMessage(
            message.from,
            message.type,
            content,
            message.id
          );
        }
      }

      if (change.value?.statuses) {
        for (const status of change.value.statuses) {
          logger.info("[WhatsApp] Message status update:", {
            id: status.id,
            status: status.status,
            timestamp: status.timestamp,
          });

          // Update message delivery status in database
          await updateMessageStatus(status.id, status.status);
        }
      }
    }

    res.status(200).json({ success: true });
  } catch (error: unknown) {
    logger.error("[WhatsApp API] Webhook error:", error);
    res.status(500).json({ error: (error instanceof Error ? error.message : String(error)) });
  }
});

/**
 * Webhook verification (Meta)
 * GET /api/whatsapp/webhook
 */
router.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const verifyToken = process.env.META_WHATSAPP_VERIFY_TOKEN || "your_verify_token";

  if (mode === "subscribe" && token === verifyToken) {
    logger.info("[WhatsApp] Webhook verified");
    res.status(200).send(challenge);
  } else {
    res.status(403).send("Forbidden");
  }
});

/**
 * Webhook for Twilio WhatsApp status callbacks
 * POST /api/whatsapp/twilio-status
 */
router.post("/twilio-status", async (req, res) => {
  try {
    const { MessageSid, MessageStatus, To, From, ErrorCode, ErrorMessage } = req.body;

    logger.info("[WhatsApp] Twilio status callback:", {
      MessageSid,
      MessageStatus,
      To,
      From,
      ErrorCode,
      ErrorMessage,
    });

    // Update message status in database
    await updateMessageStatus(MessageSid, MessageStatus, ErrorCode, ErrorMessage);

    res.status(200).send("OK");
  } catch (error: unknown) {
    logger.error("[WhatsApp API] Twilio status error:", error);
    res.status(500).json({ error: (error instanceof Error ? error.message : String(error)) });
  }
});

export default router;
