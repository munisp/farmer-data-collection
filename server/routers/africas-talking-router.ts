import crypto from "crypto";
import { router, publicProcedure } from '../_core/trpc-base.js';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { logger } from '../logger.js';
import {
  handleUSSDSession,
  parseSMSCommand,
  handleWhatsAppMessage,
  sendSMS,
  sendWhatsApp,
  notifyFarmer
} from '../services/africas-talking.js';

/**
 * Africa's Talking Webhook Router
 * 
 * Handles incoming webhooks from Africa's Talking API:
 * - USSD sessions
 * - SMS messages
 * - WhatsApp messages
 * 
 * Security: Webhooks are verified using a shared secret configured in
 * AFRICAS_TALKING_WEBHOOK_SECRET environment variable. The secret should
 * be passed as X-AT-Webhook-Secret header or as 'secret' query parameter.
 */

// Webhook verification configuration
const WEBHOOK_SECRET = process.env.AFRICAS_TALKING_WEBHOOK_SECRET;
const WEBHOOK_VERIFICATION_ENABLED = process.env.AFRICAS_TALKING_WEBHOOK_VERIFY !== 'false';

// Allowed IP ranges for Africa's Talking (optional additional security)
// These are Africa's Talking's known IP ranges - update as needed
const ALLOWED_IP_RANGES = [
  '52.0.0.0/8',      // AWS ranges used by AT
  '54.0.0.0/8',
  '34.0.0.0/8',
  '127.0.0.1',       // Localhost for testing
  '::1',             // IPv6 localhost
];

/**
 * Verify webhook request authenticity
 * Checks shared secret in header or query parameter
 */
function verifyWebhookRequest(ctx: { req?: { headers?: Record<string, string>; query?: Record<string, string> }; [key: string]: unknown }): void {
  if (!WEBHOOK_VERIFICATION_ENABLED) {
    logger.info('[Webhook] Verification disabled via AFRICAS_TALKING_WEBHOOK_VERIFY=false');
    return;
  }

  if (!WEBHOOK_SECRET) {
    logger.warn('[Webhook] AFRICAS_TALKING_WEBHOOK_SECRET not configured - skipping verification');
    return;
  }

  // Check for secret in headers (preferred) or query params
  const headerSecret = ctx?.req?.headers?.['x-at-webhook-secret'];
  const querySecret = ctx?.req?.query?.secret;
  const providedSecret = headerSecret || querySecret;

  if (!providedSecret) {
    logger.error('[Webhook] No webhook secret provided in request');
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Webhook verification failed: missing secret',
    });
  }

  if (providedSecret !== WEBHOOK_SECRET) {
    logger.error('[Webhook] Invalid webhook secret provided');
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Webhook verification failed: invalid secret',
    });
  }

  logger.info('[Webhook] Request verified successfully');
}

/**
 * Generate a correlation ID for request tracing
 */
function generateCorrelationId(): string {
  return `at-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
}

export const africasTalkingRouter = router({
  /**
   * USSD Webhook
   * Called by Africa's Talking when user interacts with USSD menu
   */
  ussdWebhook: publicProcedure
    .input(z.object({
      sessionId: z.string(),
      serviceCode: z.string(),
      phoneNumber: z.string(),
      text: z.string()
    }))
    .mutation(async ({ input, ctx }: { input: { sessionId: string; serviceCode: string; phoneNumber: string; text: string }; ctx: Record<string, unknown> }) => {
      // Verify webhook authenticity
      verifyWebhookRequest(ctx);
      
      const correlationId = generateCorrelationId();
      const response = await handleUSSDSession(input);
      
      // Log USSD interaction with correlation ID
      logger.info('[USSD]', {
        correlationId,
        sessionId: input.sessionId,
        phoneNumber: input.phoneNumber,
        text: input.text,
        response: response.response.substring(0, 50) + '...'
      });

      // Return response in Africa's Talking format
      return {
        response: response.response,
        endSession: response.endSession
      };
    }),

  /**
   * SMS Webhook
   * Called by Africa's Talking when SMS is received
   */
  smsWebhook: publicProcedure
    .input(z.object({
      from: z.string(),
      text: z.string(),
      date: z.string(),
      id: z.string().optional(),
      linkId: z.string().optional()
    }))
    .mutation(async ({ input, ctx }: { input: { from: string; text: string; date: string; id?: string; linkId?: string }; ctx: Record<string, unknown> }) => {
      // Verify webhook authenticity
      verifyWebhookRequest(ctx);
      
      const correlationId = generateCorrelationId();
      const responseText = parseSMSCommand(input);
      
      // Log SMS interaction with correlation ID
      logger.info('[SMS]', {
        correlationId,
        externalId: input.id,
        from: input.from,
        text: input.text,
        response: responseText
      });

      // Send SMS response
      await sendSMS({
        to: [input.from],
        message: responseText
      });

      return {
        success: true,
        message: 'SMS processed successfully',
        correlationId
      };
    }),

  /**
   * WhatsApp Webhook
   * Called by Africa's Talking when WhatsApp message is received
   */
  whatsappWebhook: publicProcedure
    .input(z.object({
      from: z.string(),
      text: z.string(),
      timestamp: z.string(),
      id: z.string().optional()
    }))
    .mutation(async ({ input, ctx }: { input: { from: string; text: string; timestamp: string; id?: string }; ctx: Record<string, unknown> }) => {
      // Verify webhook authenticity
      verifyWebhookRequest(ctx);
      
      const correlationId = generateCorrelationId();
      const responseText = handleWhatsAppMessage(input);
      
      // Log WhatsApp interaction with correlation ID
      logger.info('[WhatsApp]', {
        correlationId,
        externalId: input.id,
        from: input.from,
        text: input.text,
        response: responseText.substring(0, 50) + '...'
      });

      // Send WhatsApp response
      await sendWhatsApp({
        to: input.from,
        message: responseText
      });

      return {
        success: true,
        message: 'WhatsApp message processed successfully',
        correlationId
      };
    }),

  /**
   * Delivery Report Webhook
   * Called by Africa's Talking when message delivery status changes
   */
  deliveryReportWebhook: publicProcedure
    .input(z.object({
      id: z.string(),
      status: z.string(),
      phoneNumber: z.string(),
      networkCode: z.string().optional(),
      retryCount: z.number().optional(),
      failureReason: z.string().optional()
    }))
    .mutation(async ({ input, ctx }: { input: { id: string; status: string; phoneNumber: string; networkCode?: string; retryCount?: number; failureReason?: string }; ctx: Record<string, unknown> }) => {
      // Verify webhook authenticity
      verifyWebhookRequest(ctx);
      
      const correlationId = generateCorrelationId();
      
      // Log delivery status with correlation ID
      logger.info('[Delivery Report]', {
        correlationId,
        externalId: input.id,
        status: input.status,
        phoneNumber: input.phoneNumber,
        failureReason: input.failureReason
      });

      // Update message status in database with idempotency check
      try {
        const { getDb } = await import('../db.js');
        const { messageLogs, processedEvents } = await import('../../drizzle/schema.js');
        const { eq, and } = await import('drizzle-orm');
        
        const db = await getDb();
        if (db) {
          // Idempotency check: see if we've already processed this delivery report
          const eventKey = `${input.id}-${input.status}`;
          const existingEvent = await db
            .select({ id: processedEvents.id })
            .from(processedEvents)
            .where(
              and(
                eq(processedEvents.eventType, 'delivery_report'),
                eq(processedEvents.externalId, eventKey),
                eq(processedEvents.source, 'africas_talking')
              )
            )
            .limit(1);
          
          if (existingEvent.length > 0) {
            logger.info(`[Delivery Report] Duplicate event detected for ${input.id}, skipping processing`);
            return {
              success: true,
              message: 'Delivery report already processed (duplicate)',
              correlationId,
              duplicate: true
            };
          }
          
          // Map Africa's Talking status to our status
          const statusMap: Record<string, string> = {
            'Success': 'delivered',
            'Sent': 'sent',
            'Buffered': 'pending',
            'Rejected': 'failed',
            'Failed': 'failed',
          };
          
          const mappedStatus = statusMap[input.status] || input.status.toLowerCase();
          
          // Update message log by external message ID
          await db
            .update(messageLogs)
            .set({
              status: mappedStatus,
              updatedAt: new Date(),
              networkCode: input.networkCode || null,
              errorCode: input.status === 'Failed' || input.status === 'Rejected' ? input.status : null,
              errorMessage: input.failureReason || null,
            })
            .where(eq(messageLogs.externalMessageId, input.id));
          
          // Record this event as processed for idempotency
          await db.insert(processedEvents).values({
            eventType: 'delivery_report',
            externalId: eventKey,
            source: 'africas_talking',
            correlationId,
            metadata: { status: input.status, phoneNumber: input.phoneNumber },
          }).onConflictDoNothing();
          
          logger.info(`[Delivery Report] Updated message ${input.id} status to ${mappedStatus}`);
        }
      } catch (error) {
        logger.error('[Delivery Report] Failed to update message status:', error);
        // Don't fail the webhook if database update fails
      }

      return {
        success: true,
        message: 'Delivery report processed',
        correlationId
      };
    }),

  /**
   * Send SMS (for testing or manual sending)
   */
  sendSMS: publicProcedure
    .input(z.object({
      to: z.array(z.string()),
      message: z.string(),
      from: z.string().optional()
    }))
    .mutation(async ({ input }: { input: { to: string[]; message: string; from?: string } }) => {
      const result = await sendSMS(input);
      return result;
    }),

  /**
   * Send WhatsApp (for testing or manual sending)
   */
  sendWhatsApp: publicProcedure
    .input(z.object({
      to: z.string(),
      message: z.string(),
      template: z.string().optional(),
      templateParams: z.record(z.string(), z.unknown()).optional()
    }))
    .mutation(async ({ input }) => {
      const result = await sendWhatsApp(input);
      return result;
    }),

  /**
   * Notify Farmer (convenience method)
   */
  notifyFarmer: publicProcedure
    .input(z.object({
      phoneNumber: z.string(),
      message: z.string(),
      channel: z.enum(['sms', 'whatsapp']).default('sms')
    }))
    .mutation(async ({ input }: { input: { phoneNumber: string; message: string; channel: 'sms' | 'whatsapp' } }) => {
      await notifyFarmer(input.phoneNumber, input.message, input.channel);
      return {
        success: true,
        message: `Notification sent via ${input.channel}`
      };
    })
});
