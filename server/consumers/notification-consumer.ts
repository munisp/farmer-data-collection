/**
 * Notification Consumer
 * Processes notification events from Kafka
 */

import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { logger } from '../logger.js';

const kafka = new Kafka({
  clientId: 'farmer-notification-consumer',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
});

let consumer: Consumer | null = null;

// Notification event types
interface NotificationEvent {
  type: 'email' | 'sms' | 'push' | 'in_app';
  userId: number;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  email?: string;
  phoneNumber?: string;
}

/**
 * Send email notification
 */
async function sendEmailNotification(event: NotificationEvent): Promise<void> {
  if (!event.email) {
    logger.warn('[Notification Consumer] No email address for email notification');
    return;
  }

  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587');
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const fromEmail = process.env.SMTP_FROM || 'notifications@farmer-data-collection.com';

  if (!smtpUser || !smtpPass) {
    logger.info(`[Notification Consumer] Email (dev mode) to ${event.email}: ${event.title}`);
    return;
  }

  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: fromEmail,
      to: event.email,
      subject: event.title,
      text: event.message,
      html: `<div style="font-family: Arial, sans-serif;"><h2>${event.title}</h2><p>${event.message}</p></div>`,
    });

    logger.info(`[Notification Consumer] Email sent to ${event.email}`);
  } catch (error) {
    logger.error('[Notification Consumer] Email send error:', error);
  }
}

/**
 * Send SMS notification
 */
async function sendSMSNotification(event: NotificationEvent): Promise<void> {
  if (!event.phoneNumber) {
    logger.warn('[Notification Consumer] No phone number for SMS notification');
    return;
  }

  const atApiKey = process.env.AFRICASTALKING_API_KEY;
  const atUsername = process.env.AFRICASTALKING_USERNAME || 'sandbox';

  if (!atApiKey) {
    logger.info(`[Notification Consumer] SMS (dev mode) to ${event.phoneNumber}: ${event.message}`);
    return;
  }

  try {
    const AfricasTalking = (await import('africastalking')).default;
    const at = AfricasTalking({ apiKey: atApiKey, username: atUsername });
    const sms = at.SMS;

    await sms.send({
      to: [event.phoneNumber],
      message: `${event.title}\n${event.message}`,
    });

    logger.info(`[Notification Consumer] SMS sent to ${event.phoneNumber}`);
  } catch (error) {
    logger.error('[Notification Consumer] SMS send error:', error);
  }
}

/**
 * Send push notification via Firebase Cloud Messaging (FCM)
 *
 * Requires FCM_SERVER_KEY or GOOGLE_APPLICATION_CREDENTIALS env var.
 * Falls back to WebSocket notification + database save when FCM is unavailable.
 */
async function sendPushNotification(event: NotificationEvent): Promise<void> {
  const fcmServerKey = process.env.FCM_SERVER_KEY;
  const fcmProjectId = process.env.FCM_PROJECT_ID;

  // Try to get the user's FCM token from the database
  let deviceToken: string | null = null;
  try {
    const { getDb } = await import('../db.js');
    const db = await getDb();
    if (db) {
      // Query user_device_tokens table if it exists, otherwise use notification preferences
      const { sql } = await import('drizzle-orm');
      const result = await db.execute(
        sql`SELECT device_token FROM user_device_tokens WHERE user_id = ${event.userId} AND active = true ORDER BY updated_at DESC LIMIT 1`
      ).catch(() => ({ rows: [] }));
      if (result.rows.length > 0) {
        deviceToken = (result.rows[0] as { device_token: string }).device_token;
      }
    }
  } catch (err) {
    // Table may not exist yet
  }

  if (!deviceToken) {
    // Fall back to in-app notification when no device token
    logger.info(`[Notification Consumer] No device token for user ${event.userId}, saving as in-app notification`);
    await saveInAppNotification(event);
    return;
  }

  if (fcmServerKey) {
    // FCM Legacy API (simpler, uses server key)
    try {
      const response = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `key=${fcmServerKey}`,
        },
        body: JSON.stringify({
          to: deviceToken,
          notification: {
            title: event.title,
            body: event.message,
            icon: '/icons/farmconnect-192.png',
            badge: '/icons/farmconnect-badge.png',
            click_action: event.data?.url || '/',
            sound: 'default',
          },
          data: {
            type: event.type,
            userId: String(event.userId),
            timestamp: new Date().toISOString(),
            ...((event.data || {}) as Record<string, string>),
          },
          // Android-specific: high priority for time-sensitive alerts
          priority: 'high',
          // iOS-specific
          content_available: true,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.failure > 0) {
          logger.warn(`[FCM] Token may be invalid for user ${event.userId}, cleaning up`);
          // Mark token as inactive
          const { getDb } = await import('../db.js');
          const db = await getDb();
          if (db) {
            const { sql: sql2 } = await import('drizzle-orm');
            await db.execute(
              sql2`UPDATE user_device_tokens SET active = false WHERE device_token = ${deviceToken}`
            ).catch((e) => logger.debug('[FCM] Failed to deactivate stale device token', { err: e }));
          }
        } else {
          logger.info(`[FCM] Push sent to user ${event.userId}: ${event.title}`);
        }
      } else {
        logger.error(`[FCM] Push failed (${response.status}):`, await response.text());
        await saveInAppNotification(event);
      }
    } catch (err) {
      logger.error('[FCM] Push notification error:', err);
      await saveInAppNotification(event);
    }
  } else if (fcmProjectId) {
    // FCM v1 API with Google Application Default Credentials
    try {
      // Use Google Auth Library if available
      const accessToken = process.env.FCM_ACCESS_TOKEN || '';
      if (!accessToken) {
        logger.warn('[FCM] No access token available, falling back to in-app notification');
        await saveInAppNotification(event);
        return;
      }

      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${fcmProjectId}/messages:send`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            message: {
              token: deviceToken,
              notification: {
                title: event.title,
                body: event.message,
              },
              data: {
                type: event.type,
                userId: String(event.userId),
              },
              android: {
                priority: 'HIGH',
                notification: { sound: 'default', channel_id: 'farmconnect_alerts' },
              },
              apns: {
                payload: { aps: { sound: 'default', badge: 1 } },
              },
            },
          }),
        },
      );

      if (response.ok) {
        logger.info(`[FCM v1] Push sent to user ${event.userId}`);
      } else {
        logger.error(`[FCM v1] Push failed:`, await response.text());
        await saveInAppNotification(event);
      }
    } catch (err) {
      logger.error('[FCM v1] Error:', err);
      await saveInAppNotification(event);
    }
  } else {
    // No FCM configured — save as in-app notification
    logger.info(`[Notification Consumer] FCM not configured, saving as in-app notification for user ${event.userId}`);
    await saveInAppNotification(event);
  }
}

/**
 * Save in-app notification to database
 */
async function saveInAppNotification(event: NotificationEvent): Promise<void> {
  try {
    const { getDb } = await import('../db.js');
    const { notificationQueue } = await import('../../drizzle/schema.js');
    
    const db = await getDb();
    if (!db) return;

    await db.insert(notificationQueue).values({
      userId: event.userId,
      phoneNumber: event.phoneNumber || '',
      channel: 'in_app',
      notificationType: event.type,
      messageText: `${event.title}\n${event.message}`,
      messageData: event.data || null,
      status: 'pending',
    });

    logger.info(`[Notification Consumer] In-app notification saved for user ${event.userId}`);
  } catch (error) {
    logger.error('[Notification Consumer] In-app notification save error:', error);
  }
}

/**
 * Process notification event
 */
async function processNotificationEvent(event: NotificationEvent): Promise<void> {
  switch (event.type) {
    case 'email':
      await sendEmailNotification(event);
      break;
    case 'sms':
      await sendSMSNotification(event);
      break;
    case 'push':
      await sendPushNotification(event);
      break;
    case 'in_app':
      await saveInAppNotification(event);
      break;
    default:
      logger.warn(`[Notification Consumer] Unknown notification type: ${event.type}`);
  }
}

/**
 * Start notification consumer
 */
export async function startNotificationConsumer() {
  try {
    consumer = kafka.consumer({ groupId: 'notification-group' });
    
    await consumer.connect();
    await consumer.subscribe({ topic: 'notifications', fromBeginning: false });
    
    await consumer.run({
      eachMessage: async ({ topic, partition, message }: EachMessagePayload) => {
        try {
          const event = JSON.parse(message.value?.toString() || '{}') as NotificationEvent;
          logger.info('[Notification Consumer] Processing event:', event);
          
          // Process notification based on type
          await processNotificationEvent(event);
          
        } catch (error) {
          logger.error('[Notification Consumer] Error processing message:', error);
        }
      },
    });
    
    logger.info('[Notification Consumer] Started successfully');
  } catch (error) {
    logger.error('[Notification Consumer] Failed to start:', error);
    throw error;
  }
}

/**
 * Stop notification consumer
 */
export async function stopNotificationConsumer() {
  if (consumer) {
    await consumer.disconnect();
    consumer = null;
    logger.info('[Notification Consumer] Stopped');
  }
}
