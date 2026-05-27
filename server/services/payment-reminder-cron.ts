import cron from 'node-cron';
import { getDb } from '../db';
import { loans, users } from '../../drizzle/schema';
import { loanRepayments } from '../../drizzle/financial-schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { sendPaymentReminder } from './sms';

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
    console.error('[Payment Reminder] Database not available');
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
    console.error('[Payment Reminder] Error fetching upcoming payments:', error);
    return [];
  }
}

/**
 * Send payment reminders to all borrowers with upcoming payments
 */
async function sendPaymentReminders(): Promise<void> {
  console.log('[Payment Reminder] Starting daily payment reminder check...');
  
  const upcomingPayments = await getUpcomingPayments();
  
  if (upcomingPayments.length === 0) {
    console.log('[Payment Reminder] No upcoming payments found');
    return;
  }

  console.log(`[Payment Reminder] Found ${upcomingPayments.length} upcoming payment(s)`);

  let successCount = 0;
  let failureCount = 0;

  for (const payment of upcomingPayments) {
    try {
      // Skip if phone number is missing
      if (!payment.borrowerPhone) {
        console.warn(`[Payment Reminder] Skipping payment ${payment.loanNumber} - no phone number for borrower`);
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
      // Function signature: sendPaymentReminder(phoneNumber, borrowerName, amount, dueDate, lenderName)
      await sendPaymentReminder(
        payment.borrowerPhone,
        payment.borrowerName,
        payment.amount / 100, // Convert cents to currency
        payment.dueDate,
        payment.loanNumber // Using loan number as lender identifier
      );

      successCount++;
      console.log(`[Payment Reminder] Sent reminder to ${payment.borrowerName} for loan ${payment.loanNumber}`);
    } catch (error) {
      failureCount++;
      console.error(`[Payment Reminder] Failed to send reminder for loan ${payment.loanNumber}:`, error);
    }
  }

  console.log(`[Payment Reminder] Completed: ${successCount} sent, ${failureCount} failed`);
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
      console.error('[Payment Reminder] Cron job error:', error);
    }
  });

  console.log('[Payment Reminder] Cron job initialized - will run daily at 9:00 AM');
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
    console.error('[Payment Reminder] Manual trigger error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
