import crypto from "crypto";
/**
 * Loan Application Router
 * 
 * tRPC endpoints for loan application workflow
 */

import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc-base.js";
import { getDb } from "../db.js";
import { loanApplications, applicationDocuments, applicationStatusHistory } from "../../drizzle/loan-application-schema.js";
import { users } from "../../drizzle/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { documentUploadService } from "../services/document-upload-service.js";
import { checkLoanApplicationKyc } from "../middleware/kyc-enforcement.js";
import { createTemporalService, TemporalWorkflowService } from "../services/temporal-workflow-service.js";
import { logger } from '../logger.js';

// Temporal workflow service (lazy initialization)
let temporalService: TemporalWorkflowService | null = null;
let temporalConnectionAttempted = false;

async function getTemporalService(): Promise<TemporalWorkflowService | null> {
  if (temporalService) return temporalService;
  if (temporalConnectionAttempted) return null;
  
  temporalConnectionAttempted = true;
  try {
    const service = createTemporalService();
    const address = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
    await service.connect(address);
    temporalService = service;
    logger.info('[LoanApplication] Temporal workflow service connected');
    return service;
  } catch (error) {
    logger.warn('[LoanApplication] Temporal not available, workflows will run synchronously:', error);
    return null;
  }
}

/**
 * Check if user has admin role
 */
async function checkAdminRole(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  const [user] = await db.select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  
  return user?.role === 'admin';
}

export const loanApplicationRouter = router({
  /**
   * Submit a new loan application
   */
  submitApplication: protectedProcedure
    .input(
      z.object({
        loanAmount: z.number().min(1000).max(100000000), // ₦10 to ₦1,000,000
        purpose: z.string().min(10).max(1000),
        termMonths: z.number().min(1).max(60),
        fullName: z.string().min(2).max(255),
        email: z.string().email(),
        phone: z.string().min(10).max(50),
        address: z.string().min(10).max(1000),
        employmentStatus: z.string().optional(),
        monthlyIncome: z.number().optional(),
        incomeSource: z.string().optional(),
        farmSize: z.string().optional(),
        cropTypes: z.string().optional(), // JSON string
        yearsOfFarming: z.number().optional(),
      })
    )
        .mutation(async ({ input, ctx }) => {
          const db = await getDb();
          if (!db) throw new Error("Database not available");

          const userId = ctx.token ? parseInt(ctx.token) : null;
          if (!userId) throw new Error("User not authenticated");

          // Enforce KYC requirements before loan application
          const kycCheck = await checkLoanApplicationKyc(userId, input.loanAmount);
          if (!kycCheck.allowed) {
            throw new Error(kycCheck.reason || "KYC verification required for loan applications");
          }

          // Generate application number
      const applicationNumber = `APP-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

      // Insert application
      const [application] = await db
        .insert(loanApplications)
        .values({
          userId,
          applicationNumber,
          loanAmount: input.loanAmount,
          purpose: input.purpose,
          termMonths: input.termMonths,
          fullName: input.fullName,
          email: input.email,
          phone: input.phone,
          address: input.address,
          employmentStatus: input.employmentStatus || null,
          monthlyIncome: input.monthlyIncome || null,
          incomeSource: input.incomeSource || null,
          farmSize: input.farmSize || null,
          cropTypes: input.cropTypes || null,
          yearsOfFarming: input.yearsOfFarming || null,
          status: "pending",
          submittedAt: new Date(),
        })
        .returning();

      // Record status change
      await db.insert(applicationStatusHistory).values({
        applicationId: application.id,
        fromStatus: null,
        toStatus: "pending",
        changedBy: userId,
        notes: "Application submitted",
      });

      // Start Temporal workflow for loan processing (async, non-blocking)
      let workflowId: string | null = null;
      try {
        const temporal = await getTemporalService();
        if (temporal) {
          workflowId = await temporal.startLoanApplicationWorkflow({
            applicationId: applicationNumber,
            farmerId: `farmer-${userId}`,
            amount: input.loanAmount,
            purpose: input.purpose,
            termMonths: input.termMonths,
          });
          logger.info(`[LoanApplication] Temporal workflow started: ${workflowId}`);
        }
      } catch (workflowError) {
        // Log but don't fail the application if workflow fails to start
        logger.error('[LoanApplication] Failed to start Temporal workflow:', workflowError);
      }

      logger.info(`[LoanApplication] New application submitted: ${applicationNumber}`);

      return {
        success: true,
        applicationId: application.id,
        applicationNumber: application.applicationNumber,
        workflowId,
      };
    }),

  /**
   * Upload document for an application
   */
  uploadDocument: protectedProcedure
    .input(
      z.object({
        applicationId: z.number(),
        documentType: z.string(),
        fileName: z.string(),
        fileData: z.string(), // Base64 encoded file data
        mimeType: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const userId = ctx.token ? parseInt(ctx.token) : null;
      if (!userId) throw new Error("User not authenticated");

      // Verify application belongs to user
      const [application] = await db
        .select()
        .from(loanApplications)
        .where(
          and(
            eq(loanApplications.id, input.applicationId),
            eq(loanApplications.userId, userId)
          )
        );

      if (!application) {
        throw new Error("Application not found or access denied");
      }

      // Decode base64 file data
      const fileBuffer = Buffer.from(input.fileData, "base64");

      // Validate upload
      const validation = documentUploadService.validateUpload({
        applicationId: input.applicationId,
        userId,
        documentType: input.documentType,
        fileName: input.fileName,
        fileBuffer,
        mimeType: input.mimeType,
      });

      if (!validation.valid) {
        throw new Error(validation.error || "Invalid upload");
      }

      // Upload to S3
      const uploadedDoc = await documentUploadService.uploadDocument({
        applicationId: input.applicationId,
        userId,
        documentType: input.documentType,
        fileName: input.fileName,
        fileBuffer,
        mimeType: input.mimeType,
      });

      // Save document record
      const [document] = await db
        .insert(applicationDocuments)
        .values({
          applicationId: input.applicationId,
          userId,
          documentType: input.documentType,
          fileName: uploadedDoc.fileName,
          fileSize: uploadedDoc.fileSize,
          mimeType: uploadedDoc.mimeType,
          s3Key: uploadedDoc.s3Key,
          s3Url: uploadedDoc.s3Url,
        })
        .returning();

      return {
        success: true,
        documentId: document.id,
        s3Url: document.s3Url,
      };
    }),

  /**
   * Get user's loan applications
   */
  getMyApplications: protectedProcedure.query(async ({ ctx }: { ctx: any }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const userId = ctx.token ? parseInt(ctx.token) : null;
    if (!userId) throw new Error("User not authenticated");

    const applications = await db
      .select()
      .from(loanApplications)
      .where(eq(loanApplications.userId, userId))
      .orderBy(desc(loanApplications.createdAt));

    return applications;
  }),

  /**
   * Get application details with documents
   */
  getApplicationDetails: protectedProcedure
    .input(z.object({ applicationId: z.number() }))
    .query(async ({ input, ctx }: { input: any; ctx: any }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const userId = ctx.token ? parseInt(ctx.token) : null;
      if (!userId) throw new Error("User not authenticated");

      // Get application
      const [application] = await db
        .select()
        .from(loanApplications)
        .where(
          and(
            eq(loanApplications.id, input.applicationId),
            eq(loanApplications.userId, userId)
          )
        );

      if (!application) {
        throw new Error("Application not found");
      }

      // Get documents
      const documents = await db
        .select()
        .from(applicationDocuments)
        .where(eq(applicationDocuments.applicationId, input.applicationId))
        .orderBy(desc(applicationDocuments.uploadedAt));

      // Get status history
      const statusHistory = await db
        .select()
        .from(applicationStatusHistory)
        .where(eq(applicationStatusHistory.applicationId, input.applicationId))
        .orderBy(desc(applicationStatusHistory.changedAt));

      return {
        application,
        documents,
        statusHistory,
      };
    }),

  /**
   * Get all applications (admin only)
   */
  getAllApplications: protectedProcedure.query(async ({ ctx }: { ctx: any }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const userId = ctx.token ? parseInt(ctx.token) : null;
    if (!userId) throw new Error("User not authenticated");

    // Admin role check
    const isAdmin = await checkAdminRole(userId);
    if (!isAdmin) {
      throw new Error("Access denied: Admin role required");
    }

    const applications = await db
      .select()
      .from(loanApplications)
      .orderBy(desc(loanApplications.createdAt));

    return applications;
  }),

  /**
   * Update application status (admin only)
   */
  updateApplicationStatus: protectedProcedure
    .input(
      z.object({
        applicationId: z.number(),
        status: z.enum(["pending", "under_review", "approved", "rejected", "withdrawn"]),
        reviewNotes: z.string().optional(),
        rejectionReason: z.string().optional(),
        approvedAmount: z.number().optional(),
        approvedTermMonths: z.number().optional(),
        approvedInterestRate: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }: { input: any; ctx: any }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const userId = ctx.token ? parseInt(ctx.token) : null;
      if (!userId) throw new Error("User not authenticated");

      // Admin role check
      const isAdmin = await checkAdminRole(userId);
      if (!isAdmin) {
        throw new Error("Access denied: Admin role required");
      }

      // Get current application
      const [currentApp] = await db
        .select()
        .from(loanApplications)
        .where(eq(loanApplications.id, input.applicationId));

      if (!currentApp) {
        throw new Error("Application not found");
      }

      // Update application
      await db
        .update(loanApplications)
        .set({
          status: input.status,
          reviewedBy: userId,
          reviewedAt: new Date(),
          reviewNotes: input.reviewNotes || null,
          rejectionReason: input.rejectionReason || null,
          approvedAmount: input.approvedAmount || null,
          approvedTermMonths: input.approvedTermMonths || null,
          approvedInterestRate: input.approvedInterestRate || null,
          updatedAt: new Date(),
        })
        .where(eq(loanApplications.id, input.applicationId));

      // Record status change
      await db.insert(applicationStatusHistory).values({
        applicationId: input.applicationId,
        fromStatus: currentApp.status,
        toStatus: input.status,
        changedBy: userId,
        notes: input.reviewNotes || null,
      });

      logger.info(`[LoanApplication] Status updated: ${currentApp.applicationNumber} -> ${input.status}`);

      return { success: true };
    }),

  /**
   * Verify document (admin only)
   */
  verifyDocument: protectedProcedure
    .input(
      z.object({
        documentId: z.number(),
        verified: z.boolean(),
        verificationNotes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }: { input: any; ctx: any }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const userId = ctx.token ? parseInt(ctx.token) : null;
      if (!userId) throw new Error("User not authenticated");

      // Admin role check
      const isAdmin = await checkAdminRole(userId);
      if (!isAdmin) {
        throw new Error("Access denied: Admin role required");
      }

      await db
        .update(applicationDocuments)
        .set({
          verified: input.verified,
          verifiedBy: userId,
          verifiedAt: new Date(),
          verificationNotes: input.verificationNotes || null,
        })
        .where(eq(applicationDocuments.id, input.documentId));

      return { success: true };
    }),
});
