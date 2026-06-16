/**
 * Smart Notifications Service
 * 
 * Intelligent alerts for:
 * - Low yield warnings
 * - High expense alerts
 * - Optimal selling time recommendations
 * - Weather alerts
 * - Pest/disease warnings
 */

import { getDb } from '../db.js';
import { getWebSocketServer } from '../websocket-server.js';
import { pythonMLClient } from '../clients/python-ml-client.js';
import { sendSMS } from '../services/africas-talking.js';
import { users, expenses, notificationQueue } from '../../drizzle/schema.js';
import { eq, and, gte, sql, avg } from 'drizzle-orm';
import nodemailer from 'nodemailer';
import { logger } from '../logger.js';

// ============================================================================
// Types
// ============================================================================

export interface Notification {
  id: string;
  userId: number;
  type: 'alert' | 'warning' | 'info' | 'success';
  category: 'yield' | 'expense' | 'price' | 'weather' | 'pest' | 'general';
  title: string;
  message: string;
  data?: any;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  timestamp: string;
  read: boolean;
}

export interface YieldAlert {
  farmId: number;
  cropType: string;
  expectedYield: number;
  actualYield: number;
  difference: number;
  percentage: number;
}

export interface ExpenseAlert {
  category: string;
  amount: number;
  threshold: number;
  period: string;
}

export interface PriceAlert {
  cropType: string;
  currentPrice: number;
  forecastPrice: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  recommendation: string;
}

// ============================================================================
// Smart Notifications Service
// ============================================================================

export class SmartNotificationsService {
  /**
   * Check for low yield and send alerts
   */
  static async checkYieldAlerts(userId: number, harvestData: any): Promise<void> {
    try {
      const { cropType, quantity, farmSize } = harvestData;
      
      // Get expected yield from ML service
      const prediction = await pythonMLClient.predictYield({
        crop: cropType,
        farmSize,
        soilType: 'loamy', // Default, should come from farm data
        rainfall: 1000,
        temperature: 25,
        fertilizer: 'npk',
        season: 'wet',
      });

      const expectedYield = prediction.predictedYield;
      const actualYield = quantity / 1000; // Convert kg to tons
      const difference = expectedYield - actualYield;
      const percentage = (difference / expectedYield) * 100;

      // Alert if actual yield is 20% or more below expected
      if (percentage >= 20) {
        const notification: Notification = {
          id: `yield-alert-${Date.now()}`,
          userId,
          type: 'warning',
          category: 'yield',
          title: '⚠️ Low Yield Alert',
          message: `Your ${cropType} harvest is ${percentage.toFixed(1)}% below expected yield. Expected: ${expectedYield.toFixed(2)} tons, Actual: ${actualYield.toFixed(2)} tons.`,
          data: {
            cropType,
            expectedYield,
            actualYield,
            difference,
            percentage,
            recommendation: prediction.recommendation,
          },
          priority: percentage >= 40 ? 'urgent' : 'high',
          timestamp: new Date().toISOString(),
          read: false,
        };

        await this.sendNotification(notification);
      }
    } catch (error) {
      logger.error('[Smart Notifications] Error checking yield alerts:', error);
    }
  }

  /**
   * Check for high expenses and send alerts
   */
  static async checkExpenseAlerts(userId: number, expenseData: any): Promise<void> {
    try {
      const { category, amount } = expenseData;

      // Get expense statistics for the user from database
      const db = await getDb();
      if (!db) {
        logger.warn('[Smart Notifications] Database not available');
        return;
      }
      
      // Query average expense for this category in the last 90 days
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      
      const expenseStats = await db.select({
        avgAmount: sql<number>`COALESCE(AVG(amount), 0)`,
        count: sql<number>`COUNT(*)`
      })
        .from(expenses)
        .where(and(
          eq(expenses.userId, userId),
          eq(expenses.category, category),
          gte(expenses.expenseDate, ninetyDaysAgo)
        ));
      
      const avgAmount = Number(expenseStats[0]?.avgAmount) || 500; // Default to 500 if no history
      const threshold = avgAmount * 1.5; // 50% above average

      // Alert if expense is significantly above average
      if (amount > threshold) {
        const percentage = ((amount - avgAmount) / avgAmount) * 100;

        const notification: Notification = {
          id: `expense-alert-${Date.now()}`,
          userId,
          type: 'alert',
          category: 'expense',
          title: 'High Expense Alert',
          message: `Your ${category} expense of $${amount} is ${percentage.toFixed(1)}% above your average of $${avgAmount.toFixed(2)}.`,
          data: {
            category,
            amount,
            avgAmount,
            threshold,
            percentage,
          },
          priority: percentage >= 100 ? 'urgent' : 'high',
          timestamp: new Date().toISOString(),
          read: false,
        };

        await this.sendNotification(notification);
      }
    } catch (error) {
      logger.error('[Smart Notifications] Error checking expense alerts:', error);
    }
  }

  /**
   * Check for optimal selling time and send recommendations
   */
  static async checkPriceAlerts(userId: number, cropType: string): Promise<void> {
    try {
      // Get price forecast from ML service
      // Note: predictPrice method needs to be added to pythonMLClient
      // For now, we'll skip price alerts
      return;
      
      /* Commented out until predictPrice is implemented
      const forecast = await pythonMLClient.predictPrice({
        crop: cropType,
        location: 'Lagos', // Default, should come from user location
        forecastDays: 7,
      });

      const currentPrice = forecast.forecast[0].price;
      const futurePrice = forecast.forecast[forecast.forecast.length - 1].price;
      const priceChange = futurePrice - currentPrice;
      const percentage = (priceChange / currentPrice) * 100;

      // Alert if price is expected to drop significantly
      if (forecast.trend === 'decreasing' && percentage < -10) {
        const notification: Notification = {
          id: `price-alert-${Date.now()}`,
          userId,
          type: 'warning',
          category: 'price',
          title: '📉 Price Drop Alert',
          message: `${cropType} prices are expected to drop by ${Math.abs(percentage).toFixed(1)}% in the next 7 days. Consider selling soon!`,
          data: {
            cropType,
            currentPrice,
            futurePrice,
            trend: forecast.trend,
            percentage,
            recommendation: forecast.recommendation,
          },
          priority: 'high',
          timestamp: new Date().toISOString(),
          read: false,
        };

        await this.sendNotification(notification);
      }
      // Alert if price is expected to increase significantly
      else if (forecast.trend === 'increasing' && percentage > 15) {
        const notification: Notification = {
          id: `price-alert-${Date.now()}`,
          userId,
          type: 'success',
          category: 'price',
          title: '📈 Price Increase Alert',
          message: `${cropType} prices are expected to rise by ${percentage.toFixed(1)}% in the next 7 days. Good time to hold and sell later!`,
          data: {
            cropType,
            currentPrice,
            futurePrice,
            trend: forecast.trend,
            percentage,
            recommendation: forecast.recommendation,
          },
          priority: 'medium',
          timestamp: new Date().toISOString(),
          read: false,
        };

        await this.sendNotification(notification);
      }
      */
    } catch (error) {
      logger.error('[Smart Notifications] Error checking price alerts:', error);
    }
  }

  /**
   * Send notification via WebSocket and optionally SMS/Email
   */
  static async sendNotification(notification: Notification): Promise<void> {
    try {
      const wsServer = getWebSocketServer();
      
      if (wsServer) {
        wsServer.emitNotification(notification.userId, notification);
        logger.info(`[Smart Notifications] Sent ${notification.category} notification to user ${notification.userId}`);
      }

      // Check user preferences and send via SMS/Email if enabled
      const preferences = await this.getUserPreferences(notification.userId);
      
      if (preferences.smsEnabled && preferences.categories[notification.category]) {
        await this.sendSMSNotification(notification);
      }
      
      if (preferences.emailEnabled && preferences.categories[notification.category]) {
        await this.sendEmailNotification(notification);
      }
      
      // Store notification in queue for persistence
      await this.storeNotification(notification);
    } catch (error) {
      logger.error('[Smart Notifications] Error sending notification:', error);
    }
  }

  /**
   * Store notification in database queue
   */
  static async storeNotification(notification: Notification): Promise<void> {
    try {
      const db = await getDb();
      if (!db) return;
      
      // Get user phone number for the notification queue
      const userRecord = await db.select({ phoneNumber: users.phoneNumber })
        .from(users)
        .where(eq(users.id, notification.userId))
        .limit(1);
      
      const phoneNumber = userRecord[0]?.phoneNumber || '';
      
      await db.insert(notificationQueue).values({
        userId: notification.userId,
        phoneNumber,
        channel: 'in_app',
        notificationType: notification.type,
        messageText: `${notification.title}\n${notification.message}`,
        messageData: notification.data,
        status: 'sent'
      });
    } catch (error) {
      logger.error('[Smart Notifications] Error storing notification:', error);
    }
  }

  /**
   * Send SMS notification via Africa's Talking
   */
  static async sendSMSNotification(notification: Notification): Promise<void> {
    try {
      const db = await getDb();
      if (!db) return;
      
      // Get user phone number
      const userRecord = await db.select({ phoneNumber: users.phoneNumber })
        .from(users)
        .where(eq(users.id, notification.userId))
        .limit(1);
      
      const phoneNumber = userRecord[0]?.phoneNumber;
      if (!phoneNumber) {
        logger.warn(`[Smart Notifications] No phone number for user ${notification.userId}`);
        return;
      }
      
      // Send SMS via Africa's Talking
      await sendSMS({
        to: [phoneNumber],
        message: `${notification.title}\n\n${notification.message}`
      });
      
      logger.info(`[Smart Notifications] SMS sent to ${phoneNumber}`);
    } catch (error) {
      logger.error('[Smart Notifications] Error sending SMS:', error);
    }
  }

  /**
   * Send email notification via configured SMTP
   */
  static async sendEmailNotification(notification: Notification): Promise<void> {
    try {
      const db = await getDb();
      if (!db) return;
      
      // Get user email
      const userRecord = await db.select({ email: users.email })
        .from(users)
        .where(eq(users.id, notification.userId))
        .limit(1);
      
      const email = userRecord[0]?.email;
      if (!email) {
        logger.warn(`[Smart Notifications] No email for user ${notification.userId}`);
        return;
      }
      
      // Configure email transport (use environment variables)
      const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
      const smtpPort = parseInt(process.env.SMTP_PORT || '587');
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const fromEmail = process.env.SMTP_FROM || 'notifications@farmer-data-collection.com';
      
      if (!smtpUser || !smtpPass) {
        logger.warn('[Smart Notifications] SMTP credentials not configured');
        return;
      }
      
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });
      
      await transporter.sendMail({
        from: fromEmail,
        to: email,
        subject: notification.title,
        text: notification.message,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: ${notification.type === 'alert' ? '#dc2626' : notification.type === 'warning' ? '#f59e0b' : '#059669'};">
              ${notification.title}
            </h2>
            <p style="font-size: 16px; line-height: 1.5;">${notification.message}</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
            <p style="font-size: 12px; color: #6b7280;">
              This notification was sent from Farmer Data Collection Platform.
              <br />Priority: ${notification.priority}
            </p>
          </div>
        `
      });
      
      logger.info(`[Smart Notifications] Email sent to ${email}`);
    } catch (error) {
      logger.error('[Smart Notifications] Error sending email:', error);
    }
  }

  /**
   * Get user notification preferences from database
   */
  static async getUserPreferences(userId: number): Promise<{
    smsEnabled: boolean;
    emailEnabled: boolean;
    webEnabled: boolean;
    categories: Record<string, boolean>;
  }> {
    try {
      const db = await getDb();
      if (!db) {
        return this.getDefaultPreferences();
      }
      
      // Query notification preferences from users table or a dedicated preferences table
      const userRecord = await db.select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      
      if (userRecord.length === 0) {
        return this.getDefaultPreferences();
      }
      
      // For now, return default preferences since we don't have a preferences table
      // In production, this would query a user_notification_preferences table
      return this.getDefaultPreferences();
    } catch (error) {
      logger.error('[Smart Notifications] Error fetching user preferences:', error);
      return this.getDefaultPreferences();
    }
  }
  
  /**
   * Get default notification preferences
   */
  static getDefaultPreferences(): {
    smsEnabled: boolean;
    emailEnabled: boolean;
    webEnabled: boolean;
    categories: Record<string, boolean>;
  } {
    return {
      smsEnabled: process.env.ENABLE_SMS_NOTIFICATIONS === 'true',
      emailEnabled: process.env.ENABLE_EMAIL_NOTIFICATIONS === 'true',
      webEnabled: true,
      categories: {
        yield: true,
        expense: true,
        price: true,
        weather: true,
        pest: true,
        general: true,
      },
    };
  }
}

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Handle harvest recorded event
 */
export async function onHarvestRecorded(userId: number, harvestData: any): Promise<void> {
  await SmartNotificationsService.checkYieldAlerts(userId, harvestData);
  
  // Also check price alerts for the crop
  if (harvestData.cropType) {
    await SmartNotificationsService.checkPriceAlerts(userId, harvestData.cropType);
  }
}

/**
 * Handle expense logged event
 */
export async function onExpenseLogged(userId: number, expenseData: any): Promise<void> {
  await SmartNotificationsService.checkExpenseAlerts(userId, expenseData);
}

/**
 * Handle crop planted event
 */
export async function onCropPlanted(userId: number, cropData: any): Promise<void> {
  // Send welcome notification with recommendations
  const notification: Notification = {
    id: `crop-planted-${Date.now()}`,
    userId,
    type: 'info',
    category: 'general',
    title: '🌱 Crop Planted Successfully',
    message: `Your ${cropData.cropType} has been planted. We'll monitor its progress and send you timely alerts.`,
    data: cropData,
    priority: 'low',
    timestamp: new Date().toISOString(),
    read: false,
  };

  await SmartNotificationsService.sendNotification(notification);
}
