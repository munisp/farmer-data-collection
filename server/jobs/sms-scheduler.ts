import { getDb } from "../db.js";
import { smsScheduledMessages } from "../../drizzle/schema";
import { eq, and, lte } from "drizzle-orm";
import { sendSMS } from "../services/africas-talking.js";
import { logger } from '../logger.js';

/**
 * SMS Scheduler Job
 * 
 * Processes pending scheduled messages and sends them via Africa's Talking.
 * Should be run every minute via cron.
 */

export async function processPendingScheduledMessages() {
  const db = await getDb();
  if (!db) {
    logger.error("[SMS Scheduler] Database not available");
    return;
  }

  const now = new Date();
  
  try {
    // Get all pending messages that are due
    const pendingMessages = await db
      .select()
      .from(smsScheduledMessages)
      .where(
        and(
          eq(smsScheduledMessages.status, "pending"),
          lte(smsScheduledMessages.scheduledFor, now)
        )
      )
      .limit(100); // Process max 100 messages per run

    logger.info(`[SMS Scheduler] Found ${pendingMessages.length} pending messages to process`);

    let successCount = 0;
    let failureCount = 0;

    for (const message of pendingMessages) {
      try {
        // Send SMS via Africa's Talking
        const result = await sendSMS({
          to: [message.recipientPhone],
          message: message.message,
        });

        // Check if SMS was sent successfully
        const recipient = result.SMSMessageData.Recipients[0];
        if (recipient && recipient.statusCode === 101) {
          // Status code 101 means "Sent"
          await db
            .update(smsScheduledMessages)
            .set({
              status: "sent",
              sentAt: new Date(),
              deliveryStatus: "sent",
              messageId: recipient.messageId,
              cost: Math.round(parseFloat(recipient.cost.replace(/^[A-Z₦]{1,4}\s?/, '')) * 100), // Convert to minor units
              updatedAt: new Date(),
            })
            .where(eq(smsScheduledMessages.id, message.id));

          successCount++;
          logger.info(`[SMS Scheduler] Message ${message.id} sent successfully to ${message.recipientPhone}`);
        } else {
          // Update message status to failed
          await db
            .update(smsScheduledMessages)
            .set({
              status: "failed",
              errorMessage: recipient?.status || "Unknown error",
              updatedAt: new Date(),
            })
            .where(eq(smsScheduledMessages.id, message.id));

          failureCount++;
          logger.error(`[SMS Scheduler] Message ${message.id} failed: ${recipient?.status}`);
        }
      } catch (error: unknown) {
        // Update message status to failed
        await db
          .update(smsScheduledMessages)
          .set({
            status: "failed",
            errorMessage: (error instanceof Error ? error.message : String(error)),
            updatedAt: new Date(),
          })
          .where(eq(smsScheduledMessages.id, message.id));

        failureCount++;
        logger.error(`[SMS Scheduler] Error processing message ${message.id}:`, error);
      }
    }

    logger.info(`[SMS Scheduler] Completed: ${successCount} sent, ${failureCount} failed`);

    return {
      processed: pendingMessages.length,
      successCount,
      failureCount,
    };
  } catch (error) {
    logger.error("[SMS Scheduler] Error processing scheduled messages:", error);
    throw error;
  }
}

/**
 * Start the SMS scheduler cron job
 * Runs every minute to check for pending messages
 */
export function startSmsScheduler() {
  logger.info("[SMS Scheduler] Starting SMS scheduler job (runs every minute)");
  
  // Run immediately on start
  processPendingScheduledMessages().catch((error) => {
    logger.error("[SMS Scheduler] Error in initial run:", error);
  });

  // Then run every minute
  setInterval(() => {
    processPendingScheduledMessages().catch((error) => {
      logger.error("[SMS Scheduler] Error in scheduled run:", error);
    });
  }, 60 * 1000); // 60 seconds
}
