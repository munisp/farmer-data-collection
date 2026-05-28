import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc-base.js";
import { getDb } from "../db.js";
import { smsTemplates, smsScheduledMessages } from "../../drizzle/schema";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";

/**
 * SMS Templates Router
 * 
 * Provides CRUD operations for SMS templates and scheduled messages.
 * Includes template variable substitution and usage tracking.
 */

// Template variable substitution helper
function substituteVariables(template: string, variables: Record<string, unknown>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, String(value || ''));
  }
  return result;
}

export const smsTemplatesRouter = router({
  // List all templates
  list: protectedProcedure
    .input(z.object({
      type: z.string().optional(),
      isActive: z.boolean().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const conditions = [];
      
      if (input?.type) {
        conditions.push(eq(smsTemplates.type, input.type));
      }
      
      if (input?.isActive !== undefined) {
        conditions.push(eq(smsTemplates.isActive, input.isActive));
      }
      
      const templates = await db
        .select()
        .from(smsTemplates)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(smsTemplates.createdAt));
      
      return templates;
    }),

  // Alias for list (for backwards compatibility)
  getAll: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const templates = await db
        .select()
        .from(smsTemplates)
        .where(eq(smsTemplates.isActive, true))
        .orderBy(desc(smsTemplates.createdAt));
      
      return templates;
    }),

  // Get template by ID
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [template] = await db
        .select()
        .from(smsTemplates)
        .where(eq(smsTemplates.id, input.id))
        .limit(1);
      
      if (!template) {
        throw new Error("Template not found");
      }
      
      return template;
    }),

  // Get default template for a type
  getDefault: protectedProcedure
    .input(z.object({ type: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [template] = await db
        .select()
        .from(smsTemplates)
        .where(
          and(
            eq(smsTemplates.type, input.type),
            eq(smsTemplates.isDefault, true),
            eq(smsTemplates.isActive, true)
          )
        )
        .limit(1);
      
      return template || null;
    }),

  // Create new template
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      type: z.string().min(1).max(50),
      subject: z.string().max(200).optional(),
      body: z.string().min(1),
      variables: z.array(z.string()),
      description: z.string().optional(),
      isActive: z.boolean().default(true),
      isDefault: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // If setting as default, unset other defaults for this type
      if (input.isDefault) {
        await db
          .update(smsTemplates)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(
            and(
              eq(smsTemplates.type, input.type),
              eq(smsTemplates.isDefault, true)
            )
          );
      }
      
      const [template] = await db
        .insert(smsTemplates)
        .values({
          ...input,
          variables: JSON.stringify(input.variables),
          createdBy: ctx.user.id,
        })
        .returning();
      
      return { success: true, template };
    }),

  // Update template
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(100).optional(),
      type: z.string().min(1).max(50).optional(),
      subject: z.string().max(200).optional(),
      body: z.string().min(1).optional(),
      variables: z.array(z.string()).optional(),
      description: z.string().optional(),
      isActive: z.boolean().optional(),
      isDefault: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const { id, ...updates } = input;
      
      // If setting as default, unset other defaults for this type
      if (input.isDefault && input.type) {
        await db
          .update(smsTemplates)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(
            and(
              eq(smsTemplates.type, input.type),
              eq(smsTemplates.isDefault, true)
            )
          );
      }
      
      const [template] = await db
        .update(smsTemplates)
        .set({
          ...updates,
          variables: input.variables ? JSON.stringify(input.variables) : undefined,
          updatedAt: new Date(),
        })
        .where(eq(smsTemplates.id, id))
        .returning();
      
      if (!template) {
        throw new Error("Template not found");
      }
      
      return { success: true, template };
    }),

  // Set template as default for its type
  setDefault: protectedProcedure
    .input(z.object({
      id: z.number(),
      type: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Unset other defaults for this type
      await db
        .update(smsTemplates)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(
          and(
            eq(smsTemplates.type, input.type),
            eq(smsTemplates.isDefault, true)
          )
        );
      
      // Set this template as default
      const [template] = await db
        .update(smsTemplates)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(smsTemplates.id, input.id))
        .returning();
      
      if (!template) {
        throw new Error("Template not found");
      }
      
      return { success: true, template };
    }),

  // Delete template
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // First delete any scheduled messages using this template
      await db
        .delete(smsScheduledMessages)
        .where(eq(smsScheduledMessages.templateId, input.id));
      
      // Then delete the template
      await db
        .delete(smsTemplates)
        .where(eq(smsTemplates.id, input.id));
      
      return { success: true };
    }),

  // Preview template with variables
  preview: protectedProcedure
    .input(z.object({
      templateId: z.number(),
      variables: z.record(z.string(), z.any()),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [template] = await db
        .select()
        .from(smsTemplates)
        .where(eq(smsTemplates.id, input.templateId))
        .limit(1);
      
      if (!template) {
        throw new Error("Template not found");
      }
      
      const message = substituteVariables(template.body, input.variables);
      
      return {
        template,
        message,
        length: message.length,
        segments: Math.ceil(message.length / 160), // SMS segment calculation
      };
    }),

  // Increment usage count
  incrementUsage: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db
        .update(smsTemplates)
        .set({ 
          usageCount: sql`${smsTemplates.usageCount} + 1`,
          updatedAt: new Date() 
        })
        .where(eq(smsTemplates.id, input.id));
      
      return { success: true };
    }),

  // Schedule a message
  scheduleMessage: protectedProcedure
    .input(z.object({
      templateId: z.number().optional(),
      recipientPhone: z.string().min(10).max(20),
      recipientName: z.string().max(200).optional(),
      message: z.string().min(1),
      scheduledFor: z.string(), // ISO date string
      metadata: z.record(z.string(), z.any()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [scheduled] = await db
        .insert(smsScheduledMessages)
        .values({
          templateId: input.templateId,
          recipientPhone: input.recipientPhone,
          recipientName: input.recipientName,
          message: input.message,
          scheduledFor: new Date(input.scheduledFor),
          metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
          createdBy: ctx.user.id,
        })
        .returning();
      
      return { success: true, scheduledMessage: scheduled };
    }),

  // List scheduled messages
  listScheduled: protectedProcedure
    .input(z.object({
      status: z.enum(['pending', 'sent', 'failed', 'cancelled']).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const conditions = [];
      
      if (input?.status) {
        conditions.push(eq(smsScheduledMessages.status, input.status));
      }
      
      if (input?.startDate) {
        conditions.push(gte(smsScheduledMessages.scheduledFor, new Date(input.startDate)));
      }
      
      if (input?.endDate) {
        conditions.push(lte(smsScheduledMessages.scheduledFor, new Date(input.endDate)));
      }
      
      const messages = await db
        .select()
        .from(smsScheduledMessages)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(smsScheduledMessages.scheduledFor));
      
      return messages;
    }),

  // Get scheduled message by ID
  getScheduledById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [message] = await db
        .select()
        .from(smsScheduledMessages)
        .where(eq(smsScheduledMessages.id, input.id))
        .limit(1);
      
      if (!message) {
        throw new Error("Scheduled message not found");
      }
      
      return message;
    }),

  // Cancel scheduled message
  cancelScheduled: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [message] = await db
        .update(smsScheduledMessages)
        .set({ 
          status: 'cancelled',
          updatedAt: new Date() 
        })
        .where(
          and(
            eq(smsScheduledMessages.id, input.id),
            eq(smsScheduledMessages.status, 'pending')
          )
        )
        .returning();
      
      if (!message) {
        throw new Error("Message not found or already sent");
      }
      
      return { success: true, message };
    }),

  // Get pending messages (for cron job)
  getPendingMessages: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const now = new Date();
      
      const messages = await db
        .select()
        .from(smsScheduledMessages)
        .where(
          and(
            eq(smsScheduledMessages.status, 'pending'),
            lte(smsScheduledMessages.scheduledFor, now)
          )
        )
        .orderBy(smsScheduledMessages.scheduledFor);
      
      return messages;
    }),

  // Update scheduled message status
  updateScheduledStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(['sent', 'failed']),
      deliveryStatus: z.string().optional(),
      messageId: z.string().optional(),
      errorMessage: z.string().optional(),
      cost: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const { id, ...updates } = input;
      
      const [message] = await db
        .update(smsScheduledMessages)
        .set({
          ...updates,
          sentAt: updates.status === 'sent' ? new Date() : undefined,
          updatedAt: new Date(),
        })
        .where(eq(smsScheduledMessages.id, id))
        .returning();
      
      return message;
    }),

  // Schedule bulk messages for multiple loans
  scheduleBulk: protectedProcedure
    .input(z.object({
      templateId: z.number(),
      loanIds: z.array(z.number()).min(1),
      scheduledFor: z.string(), // ISO date string
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();  
      if (!db) throw new Error("Database not available");

      // Get template
      const [template] = await db
        .select()
        .from(smsTemplates)
        .where(eq(smsTemplates.id, input.templateId))
        .limit(1);
      
      if (!template) {
        throw new Error("Template not found");
      }

      // Import schema for loans and users
      const { loans, users } = await import("../../drizzle/schema");

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

          // Replace template variables
          const message = template.body
            .replace(/\{\{borrower_name\}\}/g, loan.borrowerName)
            .replace(/\{\{amount\}\}/g, `₦${(loan.amount / 100).toLocaleString()}`)
            .replace(/\{\{loan_number\}\}/g, loan.loanNumber)
            .replace(/\{\{due_date\}\}/g, loan.nextPaymentDate ? new Date(loan.nextPaymentDate).toLocaleDateString() : "N/A");

          // Schedule the message
          await db
            .insert(smsScheduledMessages)
            .values({
              templateId: input.templateId,
              recipientPhone: loan.borrowerPhone,
              recipientName: loan.borrowerName,
              message,
              scheduledFor: new Date(input.scheduledFor),
              metadata: JSON.stringify({ loanId: loan.loanId, loanNumber: loan.loanNumber }),
              createdBy: ctx.user.id,
            });

          results.successCount++;
        } catch (error: unknown) {
          results.failureCount++;
          results.errors.push(`Loan ${loanId}: ${(error instanceof Error ? error.message : String(error))}`);
        }
      }

      return results;
    }),

  // Get template types
  getTemplateTypes: protectedProcedure
    .query(async ({ ctx }) => {
      return [
        { value: 'payment_reminder', label: 'Payment Reminder' },
        { value: 'loan_approval', label: 'Loan Approval' },
        { value: 'loan_rejection', label: 'Loan Rejection' },
        { value: 'disbursement', label: 'Disbursement Notification' },
        { value: 'overdue', label: 'Overdue Payment' },
        { value: 'payment_confirmation', label: 'Payment Confirmation' },
        { value: 'custom', label: 'Custom Message' },
      ];
    }),
});
