import { getDb } from "../db.js";
import { loans, loanRepayments } from "../../drizzle/financial-schema.js";
import { users } from "../../drizzle/schema.js";
import { eq, and, lte, gte, isNull, sql } from "drizzle-orm";
import { smsService } from "./sms.service.js";
import { sendEmail } from "./email-service.js";
import { logger } from '../logger.js';

/**
 * Payment Reminder Service
 * 
 * Automatically sends reminders to borrowers about upcoming loan payments
 * Integrates with SMS (Africa's Talking) and email notification systems
 */

export interface PaymentReminderConfig {
  daysBeforePayment: number[];  // e.g., [7, 3, 1] for 7 days, 3 days, 1 day before
  enableSMS: boolean;
  enableEmail: boolean;
}

export interface UpcomingPayment {
  loanId: number;
  userId: number;
  userEmail: string | null;
  userPhone: string | null;
  loanNumber: string;
  nextPaymentDue: Date;
  daysUntilDue: number;
  monthlyPayment: number;
  outstandingBalance: number;
  lenderName?: string;
}

export class PaymentReminderService {
  private config: PaymentReminderConfig;

  constructor(config?: Partial<PaymentReminderConfig>) {
    this.config = {
      daysBeforePayment: config?.daysBeforePayment || [7, 3, 1],
      enableSMS: config?.enableSMS ?? true,
      enableEmail: config?.enableEmail ?? true,
    };
  }

  /**
   * Find all upcoming payments that need reminders
   */
  async findUpcomingPayments(): Promise<UpcomingPayment[]> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const upcomingPayments: UpcomingPayment[] = [];

    // For each reminder threshold (7 days, 3 days, 1 day)
    for (const daysAhead of this.config.daysBeforePayment) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + daysAhead);
      targetDate.setHours(0, 0, 0, 0); // Start of day

      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);

      // Find active loans with next payment due on target date
      const results = await db
        .select({
          loanId: loans.id,
          userId: loans.userId,
          loanNumber: loans.loanNumber,
          nextPaymentDue: loans.nextPaymentDue,
          monthlyPayment: loans.monthlyPayment,
          outstandingBalance: loans.outstandingBalance,
          userEmail: users.email,
        })
        .from(loans)
        .leftJoin(users, eq(loans.userId, users.id))
        .where(
          and(
            eq(loans.status, "active"),
            gte(loans.nextPaymentDue, targetDate),
            lte(loans.nextPaymentDue, nextDay),
            isNull(loans.paidOffAt)
          )
        );

      for (const result of results) {
        if (!result.nextPaymentDue) continue;

        const daysUntilDue = Math.ceil(
          (result.nextPaymentDue.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
        );

        upcomingPayments.push({
          loanId: result.loanId,
          userId: result.userId,
          userEmail: result.userEmail,
          userPhone: null, // Would need to add phone to users table
          loanNumber: result.loanNumber,
          nextPaymentDue: result.nextPaymentDue,
          daysUntilDue,
          monthlyPayment: result.monthlyPayment || 0,
          outstandingBalance: result.outstandingBalance || 0,
        });
      }
    }

    return upcomingPayments;
  }

  /**
   * Send SMS reminder via Africa's Talking
   */
  async sendSMSReminder(payment: UpcomingPayment): Promise<boolean> {
    if (!this.config.enableSMS || !payment.userPhone) {
      return false;
    }

    try {
      const message = this.formatSMSMessage(payment);
      
      // Use SMS service to send message
      const result = await smsService.sendSMS({ to: payment.userPhone || '', message });
      
      if (result.success) {
        logger.info(`[Payment Reminder SMS] Sent to ${payment.userPhone} (Message ID: ${result.messageId})`);
        return true;
      } else {
        logger.error(`[Payment Reminder SMS] Failed to send to ${payment.userPhone}: ${result.error}`);
        return false;
      }
    } catch (error) {
      logger.error(`Failed to send SMS reminder for loan ${payment.loanNumber}:`, error);
      return false;
    }
  }

  /**
   * Send email reminder
   */
  async sendEmailReminder(payment: UpcomingPayment): Promise<boolean> {
    if (!this.config.enableEmail || !payment.userEmail) {
      return false;
    }

    try {
      const subject = this.formatEmailSubject(payment);
      const html = this.formatEmailBody(payment);

      // Send email using email service
      const result = await sendEmail({
        to: payment.userEmail,
        subject,
        html,
      });

      if (result) {
        logger.info(`[Payment Reminder Email] Sent to ${payment.userEmail}`);
        return true;
      } else {
        logger.error(`[Payment Reminder Email] Failed to send to ${payment.userEmail}`);
        return false;
      }
    } catch (error) {
      logger.error(`Failed to send email reminder for loan ${payment.loanNumber}:`, error);
      return false;
    }
  }

  /**
   * Process all upcoming payment reminders
   */
  async processReminders(): Promise<{
    total: number;
    smsSent: number;
    emailSent: number;
    failed: number;
  }> {
    const upcomingPayments = await this.findUpcomingPayments();
    
    let smsSent = 0;
    let emailSent = 0;
    let failed = 0;

    logger.info(`\n📅 Processing ${upcomingPayments.length} payment reminders...`);

    for (const payment of upcomingPayments) {
      try {
        const smsSuccess = await this.sendSMSReminder(payment);
        const emailSuccess = await this.sendEmailReminder(payment);

        if (smsSuccess) smsSent++;
        if (emailSuccess) emailSent++;

        if (!smsSuccess && !emailSuccess) {
          failed++;
        }

        logger.info(
          `  ✅ Loan ${payment.loanNumber}: ${payment.daysUntilDue} days until payment (₦${
            payment.monthlyPayment / 100
          })`
        );
      } catch (error) {
        logger.error(`  ❌ Failed to process reminder for loan ${payment.loanNumber}:`, error);
        failed++;
      }
    }

    logger.info(`\n📊 Reminder Summary:`);
    logger.info(`  Total payments: ${upcomingPayments.length}`);
    logger.info(`  SMS sent: ${smsSent}`);
    logger.info(`  Emails sent: ${emailSent}`);
    logger.info(`  Failed: ${failed}\n`);

    return {
      total: upcomingPayments.length,
      smsSent,
      emailSent,
      failed,
    };
  }

  /**
   * Format SMS message
   */
  private formatSMSMessage(payment: UpcomingPayment): string {
    const amount = (payment.monthlyPayment / 100).toLocaleString("en-NG");
    const daysText = payment.daysUntilDue === 1 ? "tomorrow" : `in ${payment.daysUntilDue} days`;

    return (
      `Loan Payment Reminder: Your loan payment of ₦${amount} is due ${daysText}. ` +
      `Loan #${payment.loanNumber}. Please ensure funds are available.`
    );
  }

  /**
   * Format email subject
   */
  private formatEmailSubject(payment: UpcomingPayment): string {
    const daysText = payment.daysUntilDue === 1 ? "Tomorrow" : `in ${payment.daysUntilDue} Days`;
    return `Loan Payment Due ${daysText} - Loan #${payment.loanNumber}`;
  }

  /**
   * Format email body (HTML)
   */
  private formatEmailBody(payment: UpcomingPayment): string {
    const amount = (payment.monthlyPayment / 100).toLocaleString("en-NG", {
      style: "currency",
      currency: "NGN",
    });
    const balance = (payment.outstandingBalance / 100).toLocaleString("en-NG", {
      style: "currency",
      currency: "NGN",
    });
    const dueDate = payment.nextPaymentDue.toLocaleDateString("en-NG", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .payment-box { background-color: white; border-left: 4px solid #2563eb; padding: 20px; margin: 20px 0; }
    .amount { font-size: 32px; font-weight: bold; color: #2563eb; margin: 10px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
    .detail-label { color: #6b7280; }
    .detail-value { font-weight: 600; }
    .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Loan Payment Reminder</h1>
    </div>
    <div class="content">
      <p>Dear Valued Customer,</p>
      
      <p>This is a friendly reminder that your loan payment is due soon.</p>
      
      <div class="payment-box">
        <h2>Payment Details</h2>
        <div class="amount">${amount}</div>
        
        <div class="detail-row">
          <span class="detail-label">Loan Number:</span>
          <span class="detail-value">${payment.loanNumber}</span>
        </div>
        
        <div class="detail-row">
          <span class="detail-label">Due Date:</span>
          <span class="detail-value">${dueDate}</span>
        </div>
        
        <div class="detail-row">
          <span class="detail-label">Days Until Due:</span>
          <span class="detail-value">${payment.daysUntilDue} ${payment.daysUntilDue === 1 ? "day" : "days"}</span>
        </div>
        
        <div class="detail-row">
          <span class="detail-label">Outstanding Balance:</span>
          <span class="detail-value">${balance}</span>
        </div>
      </div>
      
      <p><strong>Please ensure that sufficient funds are available in your account before the due date.</strong></p>
      
      <p>If you have already made this payment, please disregard this reminder.</p>
      
      <p>If you have any questions or need assistance, please contact us.</p>
      
      <p>Thank you for your continued trust.</p>
      
      <div class="footer">
        <p>This is an automated reminder. Please do not reply to this email.</p>
      </div>
    </div>
  </div>
</body>
</html>
    `.trim();
  }
}

/**
 * Standalone script to run payment reminders
 * Usage: npx tsx server/services/payment-reminder.ts
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const reminderService = new PaymentReminderService();
  
  reminderService
    .processReminders()
    .then((result) => {
      logger.info("✅ Payment reminder processing completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      logger.error("❌ Payment reminder processing failed:", error);
      process.exit(1);
    });
}
