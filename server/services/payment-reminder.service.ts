import { getDb } from '../db';
import { loans, loanRepayments } from '../../drizzle/financial-schema';
import { users } from '../../drizzle/schema';
import { eq, and, lte, gte, sql } from 'drizzle-orm';
import { logger } from '../logger.js';

interface PaymentReminder {
  loanId: number;
  borrowerName: string;
  borrowerEmail: string;
  borrowerPhone: string;
  loanNumber: string;
  amountDue: number;
  dueDate: Date;
  daysUntilDue: number;
  isOverdue: boolean;
}

/**
 * Get all upcoming payments that need reminders
 * @param daysAhead - Number of days ahead to check (e.g., 7 for 7-day reminder)
 */
export async function getUpcomingPayments(daysAhead: number): Promise<PaymentReminder[]> {
  const today = new Date();
  const targetDate = new Date();
  targetDate.setDate(today.getDate() + daysAhead);

  // Query loans with upcoming payments
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const loansList = await db
    .select({
      loanId: loans.id,
      borrowerName: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, '')`,
      borrowerEmail: sql<string>`COALESCE(${users.email}, '')`,
      borrowerPhone: sql<string>`COALESCE(${users.phoneNumber}, '')`,
      loanNumber: loans.loanNumber,
      principalAmount: loans.principalAmount,
      interestRate: loans.interestRate,
      termMonths: loans.termMonths,
      disbursedAt: loans.disbursedAt,
      outstandingBalance: loans.outstandingBalance,
    })
    .from(loans)
    .leftJoin(users, eq(loans.userId, users.id))
    .where(
      and(
        eq(loans.status, 'disbursed'),
        sql`${loans.outstandingBalance} > 0`
      )
    );

  const reminders: PaymentReminder[] = [];

  for (const loan of loansList) {
    if (!loan.disbursedAt || !loan.termMonths || !loan.interestRate) continue;

    // Calculate monthly payment
    const monthlyRate = loan.interestRate / 100 / 12;
    const monthlyPayment = loan.principalAmount * 
      (monthlyRate * Math.pow(1 + monthlyRate, loan.termMonths)) / 
      (Math.pow(1 + monthlyRate, loan.termMonths) - 1);

    // Calculate next payment due date (assuming monthly payments on the same day)
    const disbursedDate = new Date(loan.disbursedAt);
    const nextPaymentDate = new Date(disbursedDate);
    
    // Find the next payment date
    let monthsElapsed = 0;
    while (nextPaymentDate <= today && monthsElapsed < loan.termMonths) {
      nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
      monthsElapsed++;
    }

    // Check if this payment is within the reminder window
    const daysUntilDue = Math.ceil((nextPaymentDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilDue === daysAhead) {
      reminders.push({
        loanId: loan.loanId,
        borrowerName: loan.borrowerName,
        borrowerEmail: loan.borrowerEmail || '',
        borrowerPhone: loan.borrowerPhone || '',
        loanNumber: loan.loanNumber,
        amountDue: monthlyPayment,
        dueDate: nextPaymentDate,
        daysUntilDue,
        isOverdue: false,
      });
    }
  }

  return reminders;
}

/**
 * Get overdue payments
 */
export async function getOverduePayments(): Promise<PaymentReminder[]> {
  const today = new Date();

  const db = await getDb();
  if (!db) throw new Error('Database not available');
  
  const loansList = await db
    .select({
      loanId: loans.id,
      borrowerName: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, '')`,
      borrowerEmail: sql<string>`COALESCE(${users.email}, '')`,
      borrowerPhone: sql<string>`COALESCE(${users.phoneNumber}, '')`,
      loanNumber: loans.loanNumber,
      principalAmount: loans.principalAmount,
      interestRate: loans.interestRate,
      termMonths: loans.termMonths,
      disbursedAt: loans.disbursedAt,
      outstandingBalance: loans.outstandingBalance,
    })
    .from(loans)
    .leftJoin(users, eq(loans.userId, users.id))
    .where(
      and(
        eq(loans.status, 'disbursed'),
        sql`${loans.outstandingBalance} > 0`
      )
    );

  const overdueReminders: PaymentReminder[] = [];

  for (const loan of loansList) {
    if (!loan.disbursedAt || !loan.termMonths || !loan.interestRate) continue;

    const monthlyRate = loan.interestRate / 100 / 12;
    const monthlyPayment = loan.principalAmount * 
      (monthlyRate * Math.pow(1 + monthlyRate, loan.termMonths)) / 
      (Math.pow(1 + monthlyRate, loan.termMonths) - 1);

    const disbursedDate = new Date(loan.disbursedAt);
    const nextPaymentDate = new Date(disbursedDate);
    
    let monthsElapsed = 0;
    while (nextPaymentDate <= today && monthsElapsed < loan.termMonths) {
      nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
      monthsElapsed++;
    }

    // If next payment date is in the past, it's overdue
    if (nextPaymentDate < today) {
      const daysOverdue = Math.ceil((today.getTime() - nextPaymentDate.getTime()) / (1000 * 60 * 60 * 24));
      
      overdueReminders.push({
        loanId: loan.loanId,
        borrowerName: loan.borrowerName,
        borrowerEmail: loan.borrowerEmail || '',
        borrowerPhone: loan.borrowerPhone || '',
        loanNumber: loan.loanNumber,
        amountDue: monthlyPayment,
        dueDate: nextPaymentDate,
        daysUntilDue: -daysOverdue,
        isOverdue: true,
      });
    }
  }

  return overdueReminders;
}

/**
 * Generate email template for payment reminder
 */
export function generateEmailTemplate(reminder: PaymentReminder): { subject: string; html: string } {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-NG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  };

  let subject: string;
  let messageType: string;
  let urgencyColor: string;

  if (reminder.isOverdue) {
    subject = `URGENT: Overdue Payment for Loan ${reminder.loanNumber}`;
    messageType = 'Overdue Payment Notice';
    urgencyColor = '#dc2626'; // red
  } else if (reminder.daysUntilDue === 1) {
    subject = `Payment Due Tomorrow for Loan ${reminder.loanNumber}`;
    messageType = 'Payment Due Tomorrow';
    urgencyColor = '#f59e0b'; // amber
  } else if (reminder.daysUntilDue === 3) {
    subject = `Payment Due in 3 Days for Loan ${reminder.loanNumber}`;
    messageType = 'Payment Reminder';
    urgencyColor = '#3b82f6'; // blue
  } else {
    subject = `Payment Due in ${reminder.daysUntilDue} Days for Loan ${reminder.loanNumber}`;
    messageType = 'Payment Reminder';
    urgencyColor = '#10b981'; // green
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: ${urgencyColor}; padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px;">${messageType}</h1>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; font-size: 16px; color: #374151;">Dear ${reminder.borrowerName},</p>
              
              <p style="margin: 0 0 20px; font-size: 16px; color: #374151;">
                ${reminder.isOverdue 
                  ? `Your payment for loan <strong>${reminder.loanNumber}</strong> is now <strong style="color: #dc2626;">overdue</strong>.`
                  : `This is a friendly reminder that your payment for loan <strong>${reminder.loanNumber}</strong> is due ${reminder.daysUntilDue === 1 ? 'tomorrow' : `in ${reminder.daysUntilDue} days`}.`
                }
              </p>
              
              <!-- Payment Details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 6px; margin: 30px 0;">
                <tr>
                  <td style="padding: 20px;">
                    <table width="100%" cellpadding="8" cellspacing="0">
                      <tr>
                        <td style="font-size: 14px; color: #6b7280; padding: 8px 0;">Loan Number:</td>
                        <td style="font-size: 14px; color: #111827; font-weight: bold; text-align: right; padding: 8px 0;">${reminder.loanNumber}</td>
                      </tr>
                      <tr>
                        <td style="font-size: 14px; color: #6b7280; padding: 8px 0;">Amount Due:</td>
                        <td style="font-size: 18px; color: #111827; font-weight: bold; text-align: right; padding: 8px 0;">${formatCurrency(reminder.amountDue)}</td>
                      </tr>
                      <tr>
                        <td style="font-size: 14px; color: #6b7280; padding: 8px 0;">Due Date:</td>
                        <td style="font-size: 14px; color: ${reminder.isOverdue ? '#dc2626' : '#111827'}; font-weight: bold; text-align: right; padding: 8px 0;">${formatDate(reminder.dueDate)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 20px 0; font-size: 16px; color: #374151;">
                ${reminder.isOverdue 
                  ? 'Please make your payment as soon as possible to avoid additional late fees and maintain your good credit standing.'
                  : 'Please ensure you have sufficient funds available to make this payment on time.'
                }
              </p>
              
              <!-- Call to Action -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="#" style="display: inline-block; background-color: ${urgencyColor}; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 16px; font-weight: bold;">Make Payment</a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 20px 0 0; font-size: 14px; color: #6b7280;">
                If you have already made this payment, please disregard this reminder. For any questions or concerns, please contact our support team.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #6b7280;">
                This is an automated reminder from Farmer Data Collection Microfinance System.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return { subject, html };
}

/**
 * Generate SMS template for payment reminder
 */
export function generateSMSTemplate(reminder: PaymentReminder): string {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-NG', {
      month: 'short',
      day: 'numeric',
    }).format(date);
  };

  if (reminder.isOverdue) {
    return `URGENT: Your loan payment of ${formatCurrency(reminder.amountDue)} for ${reminder.loanNumber} is OVERDUE (due ${formatDate(reminder.dueDate)}). Please pay immediately to avoid penalties.`;
  } else if (reminder.daysUntilDue === 1) {
    return `Reminder: Your loan payment of ${formatCurrency(reminder.amountDue)} for ${reminder.loanNumber} is due TOMORROW (${formatDate(reminder.dueDate)}). Please ensure payment is ready.`;
  } else {
    return `Reminder: Your loan payment of ${formatCurrency(reminder.amountDue)} for ${reminder.loanNumber} is due in ${reminder.daysUntilDue} days (${formatDate(reminder.dueDate)}).`;
  }
}

/**
 * Send email reminder via SMTP
 */
export async function sendEmailReminder(reminder: PaymentReminder): Promise<boolean> {
  const { subject, html } = generateEmailTemplate(reminder);
  
  // Get SMTP configuration from environment
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587');
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const fromEmail = process.env.SMTP_FROM || 'notifications@farmer-data-collection.com';
  
  if (!smtpUser || !smtpPass) {
    logger.warn('[Payment Reminder] SMTP credentials not configured, logging email instead');
    logger.info(`[EMAIL] To: ${reminder.borrowerEmail}`);
    logger.info(`[EMAIL] Subject: ${subject}`);
    return true;
  }
  
  try {
    // Dynamic import nodemailer
    const nodemailer = await import('nodemailer');
    
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
    
    await transporter.sendMail({
      from: fromEmail,
      to: reminder.borrowerEmail,
      subject,
      html,
    });
    
    logger.info(`[Payment Reminder] Email sent to ${reminder.borrowerEmail}`);
    return true;
  } catch (error) {
    logger.error('[Payment Reminder] Email send error:', error);
    return false;
  }
}

/**
 * Send SMS reminder via Africa's Talking
 */
export async function sendSMSReminder(reminder: PaymentReminder): Promise<boolean> {
  const message = generateSMSTemplate(reminder);
  
  // Get Africa's Talking configuration from environment
  const atApiKey = process.env.AFRICASTALKING_API_KEY;
  const atUsername = process.env.AFRICASTALKING_USERNAME || 'sandbox';
  const atSenderId = process.env.AFRICASTALKING_SENDER_ID;
  
  if (!atApiKey) {
    logger.warn('[Payment Reminder] Africa\'s Talking API key not configured, logging SMS instead');
    logger.info(`[SMS] To: ${reminder.borrowerPhone}`);
    logger.info(`[SMS] Message: ${message}`);
    return true;
  }
  
  try {
    // Dynamic import Africa's Talking
    const AfricasTalking = (await import('africastalking')).default;
    const at = AfricasTalking({
      apiKey: atApiKey,
      username: atUsername,
    });
    
    const sms = at.SMS;
    await sms.send({
      to: [reminder.borrowerPhone],
      message,
      from: atSenderId,
    });
    
    logger.info(`[Payment Reminder] SMS sent to ${reminder.borrowerPhone}`);
    return true;
  } catch (error) {
    logger.error('[Payment Reminder] SMS send error:', error);
    return false;
  }
}

/**
 * Process all payment reminders for a specific day range
 */
export async function processPaymentReminders(daysAhead: number): Promise<void> {
  const reminders = await getUpcomingPayments(daysAhead);
  
  for (const reminder of reminders) {
    try {
      if (reminder.borrowerEmail) {
        await sendEmailReminder(reminder);
      }
      if (reminder.borrowerPhone) {
        await sendSMSReminder(reminder);
      }
    } catch (error) {
      logger.error(`Failed to send reminder for loan ${reminder.loanNumber}:`, error);
    }
  }
  
  logger.info(`Processed ${reminders.length} payment reminders for ${daysAhead} days ahead`);
}

/**
 * Process overdue payment reminders
 */
export async function processOverdueReminders(): Promise<void> {
  const reminders = await getOverduePayments();
  
  for (const reminder of reminders) {
    try {
      if (reminder.borrowerEmail) {
        await sendEmailReminder(reminder);
      }
      if (reminder.borrowerPhone) {
        await sendSMSReminder(reminder);
      }
    } catch (error) {
      logger.error(`Failed to send overdue reminder for loan ${reminder.loanNumber}:`, error);
    }
  }
  
  logger.info(`Processed ${reminders.length} overdue payment reminders`);
}
