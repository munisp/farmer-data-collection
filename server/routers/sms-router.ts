import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc-base.js";
import { getDb } from "../db.js";
import { smsDeliveryLogs } from "../../drizzle/sms-logs-schema";
import { smsTemplates } from "../../drizzle/sms-templates-schema";
import { userNotificationPreferences } from "../../drizzle/user-preferences-schema";
import { loans } from "../../drizzle/financial-schema";
import { users } from "../../drizzle/schema";
import { eq, desc, and, sql, gte } from "drizzle-orm";
import { sendPaymentReminder } from "../services/sms";

export const smsRouter = router({
  /**
   * Get SMS delivery logs with pagination
   */
  getDeliveryLogs: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        status: z.enum(["pending", "sent", "delivered", "failed"]).optional(),
        messageType: z.enum(["payment_reminder", "loan_approval", "disbursement", "overdue_alert"]).optional()
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const conditions = [eq(smsDeliveryLogs.userId, ctx.user.id)];
      
      if (input.status) {
        conditions.push(eq(smsDeliveryLogs.status, input.status));
      }
      
      if (input.messageType) {
        conditions.push(eq(smsDeliveryLogs.messageType, input.messageType));
      }

      const logs = await db
        .select()
        .from(smsDeliveryLogs)
        .where(and(...conditions))
        .orderBy(desc(smsDeliveryLogs.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return logs;
    }),

  /**
   * Get SMS statistics for the current user
   */
  getStatistics: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const stats = await db
      .select({
        totalSent: sql<number>`count(*)`,
        delivered: sql<number>`count(*) filter (where ${smsDeliveryLogs.status} = 'delivered')`,
        failed: sql<number>`count(*) filter (where ${smsDeliveryLogs.status} = 'failed')`,
        totalCost: sql<number>`coalesce(sum(${smsDeliveryLogs.costAmount}), 0)`
      })
      .from(smsDeliveryLogs)
      .where(eq(smsDeliveryLogs.userId, ctx.user.id));

    return stats[0] || { totalSent: 0, delivered: 0, failed: 0, totalCost: 0 };
  }),

  /**
   * Send manual SMS message
   */
  sendManualMessage: protectedProcedure
    .input(
      z.object({
        phoneNumber: z.string().regex(/^\+\d{10,15}$/, "Invalid phone number format"),
        messageType: z.enum(["payment_reminder", "loan_approval", "disbursement", "overdue_alert"]),
        message: z.string().min(1).max(160, "Message must be 160 characters or less")
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Import SMS service
      const smsService = await import("../services/sms");

      // Send SMS
      const result = await smsService.sendSMS({
        to: input.phoneNumber,
        message: input.message
      });

      // Log the SMS
      const [log] = await db
        .insert(smsDeliveryLogs)
        .values({
          userId: ctx.user.id,
          phoneNumber: input.phoneNumber,
          messageType: input.messageType,
          messageContent: input.message,
          status: result.success ? "sent" : "failed",
          providerMessageId: result.messageId,
          providerStatus: result.status,
          errorMessage: result.error,
          costAmount: result.cost ? result.cost.toString() : null,
          costCurrency: "NGN",
          sentAt: result.success ? new Date() : null
        })
        .returning();

      if (!result.success) {
        throw new Error(result.error || "Failed to send SMS");
      }

      return {
        success: true,
        logId: log.id,
        messageId: result.messageId
      };
    }),

  /**
   * Send payment reminder for a specific loan
   */
  sendPaymentReminderManual: protectedProcedure
    .input(
      z.object({
        loanId: z.number()
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get loan details with borrower info
      const [loanData] = await db
        .select({
          loanId: loans.id,
          userId: loans.userId,
          loanNumber: loans.loanNumber,
          amount: loans.principalAmount,
          nextPaymentDate: loans.nextPaymentDue,
          monthlyPayment: loans.monthlyPayment,
          borrowerName: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.email})`,
          borrowerPhone: users.phoneNumber
        })
        .from(loans)
        .innerJoin(users, eq(loans.userId, users.id))
        .where(and(eq(loans.id, input.loanId), eq(loans.userId, ctx.user.id)));

      const loan = loanData;

      if (!loan) {
        throw new Error("Loan not found");
      }

      if (!loan.borrowerPhone) {
        throw new Error("Borrower phone number not available");
      }

      // Check user notification preferences
      const [prefs] = await db
        .select()
        .from(userNotificationPreferences)
        .where(eq(userNotificationPreferences.userId, ctx.user.id));

      if (prefs && !prefs.smsEnabled) {
        throw new Error("SMS notifications are disabled for this user");
      }

      if (prefs && !prefs.paymentReminders) {
        throw new Error("Payment reminders are disabled for this user");
      }

      // Format message content
      const formattedAmount = new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
        minimumFractionDigits: 0,
      }).format(loan.monthlyPayment || loan.amount);

      const formattedDate = (loan.nextPaymentDate || new Date()).toLocaleDateString('en-NG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const messageContent = `Dear ${loan.borrowerName}, this is a reminder that your loan payment of ${formattedAmount} for loan ${loan.loanNumber} is due on ${formattedDate}. Please ensure timely payment to avoid penalties.`;

      // Send payment reminder
      const dueDateStr = loan.nextPaymentDate instanceof Date
        ? loan.nextPaymentDate.toISOString().split('T')[0]
        : String(loan.nextPaymentDate || 'N/A');
      const result = await sendPaymentReminder(
        loan.borrowerPhone,
        loan.borrowerName,
        loan.monthlyPayment || loan.amount,
        dueDateStr,
        'NGN'
      );

      // Log the SMS
      const [log] = await db
        .insert(smsDeliveryLogs)
        .values({
          userId: ctx.user.id,
          loanId: loan.loanId,
          phoneNumber: loan.borrowerPhone,
          messageType: "payment_reminder",
          messageContent,
          status: result.success ? "sent" : "failed",
          providerMessageId: result.messageId,
          providerStatus: result.status,
          errorMessage: result.error,
          costAmount: result.cost ? result.cost.toString() : null,
          costCurrency: "NGN",
          sentAt: result.success ? new Date() : null
        })
        .returning();

      if (!result.success) {
        throw new Error(result.error || "Failed to send payment reminder");
      }

      return {
        success: true,
        logId: log.id,
        messageId: result.messageId
      };
    }),

  /**
   * Get notification preferences for current user
   */
  getNotificationPreferences: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [prefs] = await db
      .select()
      .from(userNotificationPreferences)
      .where(eq(userNotificationPreferences.userId, ctx.user.id));

    // Return default preferences if not set
    if (!prefs) {
      return {
        smsEnabled: true,
        paymentReminders: true,
        loanApprovalNotifications: true,
        loanDisbursementNotifications: true,
        overdueNotifications: true,
        marketingMessages: false,
        reminderDaysBefore: 3
      };
    }

    return prefs;
  }),

  /**
   * Update notification preferences
   */
  updateNotificationPreferences: protectedProcedure
    .input(
      z.object({
        smsEnabled: z.boolean().optional(),
        paymentReminders: z.boolean().optional(),
        loanApprovals: z.boolean().optional(),
        disbursements: z.boolean().optional(),
        overdueNotifications: z.boolean().optional(),
        marketingMessages: z.boolean().optional(),
        reminderDaysBefore: z.number().min(1).max(7).optional()
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Check if preferences exist
      const [existing] = await db
        .select()
        .from(userNotificationPreferences)
        .where(eq(userNotificationPreferences.userId, ctx.user.id));

      // Map frontend field names to database field names
      const dbFields: Record<string, unknown> = {};
      if (input.smsEnabled !== undefined) dbFields.smsEnabled = input.smsEnabled;
      if (input.paymentReminders !== undefined) dbFields.paymentReminders = input.paymentReminders;
      if (input.loanApprovals !== undefined) dbFields.loanApprovalNotifications = input.loanApprovals;
      if (input.disbursements !== undefined) dbFields.loanDisbursementNotifications = input.disbursements;
      if (input.overdueNotifications !== undefined) dbFields.overdueNotifications = input.overdueNotifications;
      if (input.marketingMessages !== undefined) dbFields.marketingMessages = input.marketingMessages;
      if (input.reminderDaysBefore !== undefined) dbFields.reminderDaysBefore = input.reminderDaysBefore;

      if (existing) {
        // Update existing preferences
        const [updated] = await db
          .update(userNotificationPreferences)
          .set({
            ...dbFields,
            updatedAt: new Date()
          })
          .where(eq(userNotificationPreferences.userId, ctx.user.id))
          .returning();

        return updated;
      } else {
        // Create new preferences
        const [created] = await db
          .insert(userNotificationPreferences)
          .values({
            userId: ctx.user.id,
            ...dbFields
          })
          .returning();

        return created;
      }
    }),

  /**
   * Send bulk payment reminders for multiple loans
   */
  sendBulkPaymentReminders: protectedProcedure
    .input(
      z.object({
        loanIds: z.array(z.number()).min(1, "At least one loan ID is required"),
        templateId: z.number().optional()
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const results = {
        successCount: 0,
        failureCount: 0,
        errors: [] as string[]
      };

      // Process each loan
      for (const loanId of input.loanIds) {
        try {
          // Get loan details with borrower info
          const [loan] = await db
            .select({
              loanId: loans.id,
              loanNumber: loans.loanNumber,
              amount: loans.principalAmount,
              nextPaymentDate: loans.nextPaymentDue,
              borrowerId: loans.userId,
              borrowerName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
              borrowerPhone: users.phoneNumber
            })
            .from(loans)
            .innerJoin(users, eq(loans.userId, users.id))
            .where(eq(loans.id, loanId));

          if (!loan || !loan.borrowerPhone) {
            results.failureCount++;
            results.errors.push(`Loan ${loanId}: No phone number found`);
            continue;
          }

          // Check notification preferences
          const [prefs] = await db
            .select()
            .from(userNotificationPreferences)
            .where(eq(userNotificationPreferences.userId, loan.borrowerId));

          // Skip if SMS disabled or payment reminders disabled
          if (prefs && (!prefs.smsEnabled || !prefs.paymentReminders)) {
            results.failureCount++;
            results.errors.push(`Loan ${loanId}: SMS notifications disabled for borrower`);
            continue;
          }

          // Get message content from template or use default
          let messageContent: string;
          if (input.templateId) {
            const [template] = await db
              .select()
              .from(smsTemplates)
              .where(eq(smsTemplates.id, input.templateId));
            
            if (template) {
              // Replace template variables
              messageContent = template.body
                .replace(/\{\{borrower_name\}\}/g, loan.borrowerName)
                .replace(/\{\{amount\}\}/g, `₦${(loan.amount / 100).toLocaleString()}`)
                .replace(/\{\{loan_number\}\}/g, loan.loanNumber)
                .replace(/\{\{due_date\}\}/g, loan.nextPaymentDate ? new Date(loan.nextPaymentDate).toLocaleDateString() : "N/A");
            } else {
              // Fallback to default message
              messageContent = `Dear ${loan.borrowerName}, your payment of ₦${(loan.amount / 100).toLocaleString()} for loan ${loan.loanNumber} is due on ${loan.nextPaymentDate ? new Date(loan.nextPaymentDate).toLocaleDateString() : "N/A"}. Please ensure timely payment to avoid penalties.`;
            }
          } else {
            // Default message
            messageContent = `Dear ${loan.borrowerName}, your payment of ₦${(loan.amount / 100).toLocaleString()} for loan ${loan.loanNumber} is due on ${loan.nextPaymentDate ? new Date(loan.nextPaymentDate).toLocaleDateString() : "N/A"}. Please ensure timely payment to avoid penalties.`;
          }

          const smsService = await import("../services/sms");
          const result = await smsService.sendSMS({
            to: loan.borrowerPhone,
            message: messageContent
          });

          // Log the SMS
          await db
            .insert(smsDeliveryLogs)
            .values({
              userId: ctx.user.id,
              loanId: loan.loanId,
              phoneNumber: loan.borrowerPhone,
              messageType: "payment_reminder",
              messageContent,
              status: result.success ? "sent" : "failed",
              providerMessageId: result.messageId,
              providerStatus: result.status,
              errorMessage: result.error,
              costAmount: result.cost ? result.cost.toString() : null,
              costCurrency: "NGN",
              sentAt: result.success ? new Date() : null
            });

          if (result.success) {
            results.successCount++;
          } else {
            results.failureCount++;
            results.errors.push(`Loan ${loanId}: ${result.error || "Unknown error"}`);
          }
        } catch (error) {
          results.failureCount++;
          results.errors.push(`Loan ${loanId}: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }

      return results;
    })
});
