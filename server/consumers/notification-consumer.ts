/**
 * Notification Consumer
 * Processes notification events from Kafka
 */

import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';

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
    console.warn('[Notification Consumer] No email address for email notification');
    return;
  }

  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587');
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const fromEmail = process.env.SMTP_FROM || 'notifications@farmer-data-collection.com';

  if (!smtpUser || !smtpPass) {
    console.log(`[Notification Consumer] Email (dev mode) to ${event.email}: ${event.title}`);
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

    console.log(`[Notification Consumer] Email sent to ${event.email}`);
  } catch (error) {
    console.error('[Notification Consumer] Email send error:', error);
  }
}

/**
 * Send SMS notification
 */
async function sendSMSNotification(event: NotificationEvent): Promise<void> {
  if (!event.phoneNumber) {
    console.warn('[Notification Consumer] No phone number for SMS notification');
    return;
  }

  const atApiKey = process.env.AFRICASTALKING_API_KEY;
  const atUsername = process.env.AFRICASTALKING_USERNAME || 'sandbox';

  if (!atApiKey) {
    console.log(`[Notification Consumer] SMS (dev mode) to ${event.phoneNumber}: ${event.message}`);
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

    console.log(`[Notification Consumer] SMS sent to ${event.phoneNumber}`);
  } catch (error) {
    console.error('[Notification Consumer] SMS send error:', error);
  }
}

/**
 * Send push notification (placeholder for FCM/APNs integration)
 */
async function sendPushNotification(event: NotificationEvent): Promise<void> {
  // Push notifications would integrate with Firebase Cloud Messaging or Apple Push Notification Service
  console.log(`[Notification Consumer] Push notification for user ${event.userId}: ${event.title}`);
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

    console.log(`[Notification Consumer] In-app notification saved for user ${event.userId}`);
  } catch (error) {
    console.error('[Notification Consumer] In-app notification save error:', error);
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
      console.warn(`[Notification Consumer] Unknown notification type: ${event.type}`);
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
          console.log('[Notification Consumer] Processing event:', event);
          
          // Process notification based on type
          await processNotificationEvent(event);
          
        } catch (error) {
          console.error('[Notification Consumer] Error processing message:', error);
        }
      },
    });
    
    console.log('[Notification Consumer] Started successfully');
  } catch (error) {
    console.error('[Notification Consumer] Failed to start:', error);
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
    console.log('[Notification Consumer] Stopped');
  }
}
