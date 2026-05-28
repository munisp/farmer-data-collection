import cron from 'node-cron';
import { getDb } from '../db';
import { loans, users } from '../../drizzle/schema';
import { loanRepayments } from '../../drizzle/financial-schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { sendPaymentReminder } from './sms.js';
import { logger } from '../logger.js';

/**
 * Automated Payment Reminder Service
 * 
 * Sends SMS reminders to borrowers 3 days before their loan payment is due.
 * Runs daily at 9:00 AM to check for upcoming payments.
 */

interface UpcomingPayment {
  loanId: number;
  borrowerId: number;
  borrowerPhone: string;
  borrowerName: string;
  paymentNumber: number;
  dueDate: Date;
  amount: number;
  loanNumber: string;
}

/**
 * Get all upcoming payments due in the next 3 days
 */
async function getUpcomingPayments(): Promise<UpcomingPayment[]> {
  const db = await getDb();
  if (!db) {
    logger.error('[Payment Reminder] Database not available');
    return [];
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const threeDaysFromNow = new Date(today);
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

  try {
    const upcomingPayments = await db
      .select({
        loanId: loanRepayments.loanId,
        borrowerId: loans.userId,
        borrowerPhone: users.phoneNumber,
        borrowerName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
        paymentNumber: loanRepayments.paymentNumber,
        dueDate: loanRepayments.dueDate,
        amount: loanRepayments.totalAmount,
        loanNumber: loans.loanNumber,
      })
      .from(loanRepayments)
      .innerJoin(loans, eq(loanRepayments.loanId, loans.id))
      .innerJoin(users, eq(loans.userId, users.id))
      .where(
        and(
          eq(loanRepayments.status, 'pending'),
          gte(loanRepayments.dueDate, today),
          lte(loanRepayments.dueDate, threeDaysFromNow)
        )
      );

    return upcomingPayments as UpcomingPayment[];
  } catch (error) {
    logger.error('[Payment Reminder] Error fetching upcoming payments:', error);
    return [];
  }
}

/**
 * Send payment reminders to all borrowers with upcoming payments
 */
async function sendPaymentReminders(): Promise<void> {
  logger.info('[Payment Reminder] Starting daily payment reminder check...');
  
  const upcomingPayments = await getUpcomingPayments();
  
  if (upcomingPayments.length === 0) {
    logger.info('[Payment Reminder] No upcoming payments found');
    return;
  }

  logger.info(`[Payment Reminder] Found ${upcomingPayments.length} upcoming payment(s)`);

  let successCount = 0;
  let failureCount = 0;

  for (const payment of upcomingPayments) {
    try {
      // Skip if phone number is missing
      if (!payment.borrowerPhone) {
        logger.warn(`[Payment Reminder] Skipping payment ${payment.loanNumber} - no phone number for borrower`);
        failureCount++;
        continue;
      }

      // Calculate days until due
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dueDate = new Date(payment.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      // Send SMS reminder
      const dueDateStr = payment.dueDate instanceof Date
        ? payment.dueDate.toISOString().split('T')[0]
        : String(payment.dueDate || 'N/A');
      await sendPaymentReminder(
        payment.borrowerPhone,
        payment.borrowerName,
        payment.amount / 100,
        dueDateStr,
        'NGN'
      );

      successCount++;
      logger.info(`[Payment Reminder] Sent reminder to ${payment.borrowerName} for loan ${payment.loanNumber}`);
    } catch (error) {
      failureCount++;
      logger.error(`[Payment Reminder] Failed to send reminder for loan ${payment.loanNumber}:`, error);
    }
  }

  logger.info(`[Payment Reminder] Completed: ${successCount} sent, ${failureCount} failed`);
}

/**
 * Initialize the payment reminder cron job
 * Runs daily at 9:00 AM
 */
export function initPaymentReminderCron(): void {
  // Schedule: Run daily at 9:00 AM
  // Cron format: second minute hour day month weekday
  const cronSchedule = '0 0 9 * * *';

  cron.schedule(cronSchedule, async () => {
    try {
      await sendPaymentReminders();
    } catch (error) {
      logger.error('[Payment Reminder] Cron job error:', error);
    }
  });

  logger.info('[Payment Reminder] Cron job initialized - will run daily at 9:00 AM');
}

/**
 * Manual trigger for testing (can be called from tRPC endpoint)
 */
export async function triggerPaymentReminders(): Promise<{ success: boolean; message: string }> {
  try {
    await sendPaymentReminders();
    return {
      success: true,
      message: 'Payment reminders sent successfully',
    };
  } catch (error) {
    logger.error('[Payment Reminder] Manual trigger error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
