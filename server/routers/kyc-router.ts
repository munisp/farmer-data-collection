/**
 * KYC Router
 * API endpoints for KYC verification and management
 */

import { z } from 'zod';
import { router, protectedProcedure, publicProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { createKycService, type KycTier, type KycStatus, type DocumentType } from '../services/kyc-service.js';
import { getDb } from '../db.js';
import { userKycProfiles, kycDocuments, kycVerificationHistory } from '../../drizzle/kyc-schema.js';
import { eq, desc, and } from 'drizzle-orm';

const kycService = createKycService();

// Validation schemas
const documentTypeSchema = z.enum([
  'national_id', 'passport', 'drivers_license', 'voters_card', 
  'bvn', 'nin', 'utility_bill', 'bank_statement', 
  'tax_certificate', 'business_registration', 'selfie', 'proof_of_address', 'other'
]);

const kycTierSchema = z.enum(['unverified', 'basic', 'standard', 'enhanced', 'premium']);
const kycStatusSchema = z.enum(['pending', 'in_review', 'approved', 'rejected', 'expired', 'suspended']);

export const kycRouter = router({
  // ==================== Profile Management ====================

  // Get current user's KYC profile
  getProfile: protectedProcedure
    .query(async ({ ctx }): Promise<{
      profile: {
        currentTier: KycTier;
        status: KycStatus;
        phoneVerified: boolean;
        emailVerified: boolean;
        idVerified: boolean;
        addressVerified: boolean;
        biometricVerified: boolean;
        riskScore: number | null;
        riskLevel: string | null;
        limits: {
          dailyLimit: number;
          monthlyLimit: number;
          singleLimit: number;
          maxLoan: number;
        };
        nextTierRequirements: string[];
      };
      documents: Array<{
        id: number;
        documentType: DocumentType;
        status: KycStatus;
        uploadedAt: string;
      }>;
    }> => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      // Fetch KYC profile from database
      const [profile] = await db.select().from(userKycProfiles).where(eq(userKycProfiles.userId, Number(userId))).limit(1);
      
      // If no profile exists, create one with default values
      if (!profile) {
        const [newProfile] = await db.insert(userKycProfiles).values({
          userId: Number(userId),
          currentTier: 'unverified',
          status: 'pending',
        }).returning();
        
        const limits = kycService.getTierLimits('unverified');
        return {
          profile: {
            currentTier: 'unverified',
            status: 'pending',
            phoneVerified: false,
            emailVerified: false,
            idVerified: false,
            addressVerified: false,
            biometricVerified: false,
            riskScore: null,
            riskLevel: null,
            limits: {
              dailyLimit: limits.dailyLimit,
              monthlyLimit: limits.monthlyLimit,
              singleLimit: limits.singleLimit,
              maxLoan: limits.maxLoan,
            },
            nextTierRequirements: ['Verify phone number'],
          },
          documents: [],
        };
      }

      // Fetch documents for this profile
      const documents = await db.select().from(kycDocuments)
        .where(eq(kycDocuments.kycProfileId, profile.id))
        .orderBy(desc(kycDocuments.uploadedAt));

      const currentTier = profile.currentTier as KycTier;
      const limits = kycService.getTierLimits(currentTier);
      
      // Calculate next tier requirements
      const nextTierRequirements: string[] = [];
      if (!profile.phoneVerified) nextTierRequirements.push('Verify phone number');
      if (!profile.emailVerified) nextTierRequirements.push('Verify email');
      if (!profile.idVerified) nextTierRequirements.push('Upload and verify ID document');
      if (!profile.addressVerified) nextTierRequirements.push('Verify address');
      if (!profile.biometricVerified) nextTierRequirements.push('Complete biometric verification');

      return {
        profile: {
          currentTier,
          status: profile.status as KycStatus,
          phoneVerified: profile.phoneVerified ?? false,
          emailVerified: profile.emailVerified ?? false,
          idVerified: profile.idVerified ?? false,
          addressVerified: profile.addressVerified ?? false,
          biometricVerified: profile.biometricVerified ?? false,
          riskScore: profile.riskScore,
          riskLevel: profile.riskLevel,
          limits: {
            dailyLimit: limits.dailyLimit,
            monthlyLimit: limits.monthlyLimit,
            singleLimit: limits.singleLimit,
            maxLoan: limits.maxLoan,
          },
          nextTierRequirements,
        },
        documents: documents.map(doc => ({
          id: doc.id,
          documentType: doc.documentType as DocumentType,
          status: doc.status as KycStatus,
          uploadedAt: doc.uploadedAt.toISOString(),
        })),
      };
    }),

  // Get KYC profile by user ID (admin only)
  getProfileByUserId: protectedProcedure
    .input(z.object({
      userId: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      // Check admin permission
      if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'compliance_officer') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      // In production, fetch from database
      return {
        userId: input.userId,
        currentTier: 'standard' as KycTier,
        status: 'approved' as KycStatus,
        phoneVerified: true,
        emailVerified: true,
        idVerified: true,
        addressVerified: false,
        biometricVerified: false,
      };
    }),

  // ==================== Phone Verification ====================

  // Send phone OTP
  sendPhoneOtp: protectedProcedure
    .input(z.object({
      phoneNumber: z.string().min(10).max(15),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const result = await kycService.sendPhoneOtp(Number(userId), input.phoneNumber);
      
      if (!result.success) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: result.message });
      }

      return {
        success: true,
        message: result.message,
        expiresIn: result.expiresIn,
      };
    }),

  // Verify phone OTP
  verifyPhoneOtp: protectedProcedure
    .input(z.object({
      phoneNumber: z.string().min(10).max(15),
      code: z.string().length(6),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const result = await kycService.verifyPhoneOtp(Number(userId), input.phoneNumber, input.code);
      
      if (!result.success) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: result.message });
      }

      // In production, update user's KYC profile in database
      // await db.update(userKycProfiles).set({ phoneVerified: true }).where(eq(userKycProfiles.userId, userId));

      return {
        success: true,
        message: result.message,
        newTier: 'basic' as KycTier, // Phone verification unlocks basic tier
      };
    }),

  // ==================== Email Verification ====================

  // Send email OTP
  sendEmailOtp: protectedProcedure
    .input(z.object({
      email: z.string().email(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const result = await kycService.sendEmailOtp(Number(userId), input.email);
      
      if (!result.success) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: result.message });
      }

      return {
        success: true,
        message: result.message,
        expiresIn: result.expiresIn,
      };
    }),

  // Verify email OTP
  verifyEmailOtp: protectedProcedure
    .input(z.object({
      email: z.string().email(),
      code: z.string().length(6),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const result = await kycService.verifyEmailOtp(Number(userId), input.email, input.code);
      
      if (!result.success) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: result.message });
      }

      return {
        success: true,
        message: result.message,
      };
    }),

  // ==================== Document Verification ====================

  // Upload KYC document
  uploadDocument: protectedProcedure
    .input(z.object({
      documentType: documentTypeSchema,
      fileUrl: z.string().url(),
      fileName: z.string().optional(),
      fileSize: z.number().optional(),
      mimeType: z.string().optional(),
      documentNumber: z.string().optional(),
      issuingCountry: z.string().optional(),
      issueDate: z.string().optional(),
      expiryDate: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      // Get or create KYC profile
      let [profile] = await db.select().from(userKycProfiles).where(eq(userKycProfiles.userId, Number(userId))).limit(1);
      if (!profile) {
        [profile] = await db.insert(userKycProfiles).values({
          userId: Number(userId),
          currentTier: 'unverified',
          status: 'pending',
        }).returning();
      }

      // Save document to database
      const [document] = await db.insert(kycDocuments).values({
        userId: Number(userId),
        kycProfileId: profile.id,
        documentType: input.documentType,
        fileUrl: input.fileUrl,
        fileName: input.fileName,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        documentNumber: input.documentNumber,
        issuingCountry: input.issuingCountry,
        issueDate: input.issueDate ? new Date(input.issueDate) : undefined,
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
        status: 'pending',
      }).returning();

      return {
        success: true,
        documentId: document.id,
        status: 'pending' as KycStatus,
        message: 'Document uploaded successfully. Verification in progress.',
      };
    }),

  // Verify uploaded document
  verifyDocument: protectedProcedure
    .input(z.object({
      documentId: z.number(),
      documentType: documentTypeSchema,
      fileUrl: z.string().url(),
      expectedData: z.object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        dateOfBirth: z.string().optional(),
        idNumber: z.string().optional(),
      }).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const result = await kycService.verifyDocument(
        input.documentType,
        input.fileUrl,
        input.expectedData
      );

      // In production, update document status in database
      // await db.update(kycDocuments).set({
      //   status: result.verified ? 'approved' : 'rejected',
      //   verificationResult: result,
      // }).where(eq(kycDocuments.id, input.documentId));

      return {
        success: result.success,
        verified: result.verified,
        confidence: result.confidence,
        extractedData: result.extractedData,
        errors: result.errors,
        warnings: result.warnings,
      };
    }),

  // Get user's documents
  getDocuments: protectedProcedure
    .query(async ({ ctx }): Promise<Array<{
      id: number;
      documentType: DocumentType;
      documentNumber: string | null;
      status: KycStatus;
      uploadedAt: string;
      verificationResult: any;
    }>> => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      // Fetch documents from database
      const documents = await db.select().from(kycDocuments)
        .where(eq(kycDocuments.userId, Number(userId)))
        .orderBy(desc(kycDocuments.uploadedAt));

      return documents.map(doc => ({
        id: doc.id,
        documentType: doc.documentType as DocumentType,
        documentNumber: doc.documentNumber,
        status: doc.status as KycStatus,
        uploadedAt: doc.uploadedAt.toISOString(),
        verificationResult: doc.verificationResult,
      }));
    }),

  // ==================== ID Verification (Country-Specific) ====================

  // Verify Kenya National ID
  verifyKenyaId: protectedProcedure
    .input(z.object({
      idNumber: z.string().min(7).max(8),
      firstName: z.string(),
      lastName: z.string(),
      dateOfBirth: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const result = await kycService.verifyKenyaId(input.idNumber, {
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth,
      });

      return {
        success: result.success,
        verified: result.verified,
        confidence: result.confidence,
        extractedData: result.extractedData,
        errors: result.errors,
      };
    }),

  // Verify Nigeria BVN
  verifyBvn: protectedProcedure
    .input(z.object({
      bvn: z.string().length(11),
      firstName: z.string(),
      lastName: z.string(),
      dateOfBirth: z.string(),
      phoneNumber: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const result = await kycService.verifyBvn(input.bvn, {
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth,
        phoneNumber: input.phoneNumber,
      });

      return {
        success: result.success,
        verified: result.verified,
        confidence: result.confidence,
        errors: result.errors,
      };
    }),

  // Verify Nigeria NIN
  verifyNin: protectedProcedure
    .input(z.object({
      nin: z.string().length(11),
      firstName: z.string(),
      lastName: z.string(),
      dateOfBirth: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const result = await kycService.verifyNin(input.nin, {
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth,
      });

      return {
        success: result.success,
        verified: result.verified,
        confidence: result.confidence,
        errors: result.errors,
      };
    }),

  // ==================== Biometric Verification ====================

  // Verify face match
  verifyFaceMatch: protectedProcedure
    .input(z.object({
      selfieUrl: z.string().url(),
      documentUrl: z.string().url(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const result = await kycService.verifyFaceMatch(input.selfieUrl, input.documentUrl);

      return {
        success: true,
        matched: result.matched,
        confidence: result.confidence,
        livenessScore: result.livenessScore,
      };
    }),

  // ==================== Address Verification ====================

  // Verify address from document
  verifyAddress: protectedProcedure
    .input(z.object({
      documentUrl: z.string().url(),
      expectedAddress: z.object({
        street: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        postalCode: z.string().optional(),
        country: z.string().optional(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const result = await kycService.verifyAddress(input.documentUrl, input.expectedAddress);

      return {
        success: result.success,
        verified: result.verified,
        confidence: result.confidence,
        extractedData: result.extractedData,
        errors: result.errors,
      };
    }),

  // ==================== Sanctions & PEP Screening ====================

  // Screen user against sanctions lists
  screenSanctions: protectedProcedure
    .input(z.object({
      firstName: z.string(),
      lastName: z.string(),
      dateOfBirth: z.string().optional(),
      nationality: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Only admins can run sanctions screening
      if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'compliance_officer') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const result = await kycService.screenSanctions(
        input.firstName,
        input.lastName,
        input.dateOfBirth,
        input.nationality
      );

      return result;
    }),

  // Screen user for PEP status
  screenPep: protectedProcedure
    .input(z.object({
      firstName: z.string(),
      lastName: z.string(),
      nationality: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Only admins can run PEP screening
      if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'compliance_officer') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const result = await kycService.screenPep(
        input.firstName,
        input.lastName,
        input.nationality
      );

      return result;
    }),

  // ==================== Tier Management ====================

  // Request tier upgrade
  requestTierUpgrade: protectedProcedure
    .input(z.object({
      targetTier: kycTierSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      // In production, check if user meets requirements and create upgrade request
      return {
        success: true,
        requestId: Date.now(),
        status: 'pending' as KycStatus,
        message: `Tier upgrade request to ${input.targetTier} submitted for review`,
      };
    }),

  // Get tier requirements
  getTierRequirements: publicProcedure
    .input(z.object({
      tier: kycTierSchema,
    }))
    .query(async ({ input }) => {
      const limits = kycService.getTierLimits(input.tier);
      
      const requirements: Record<KycTier, string[]> = {
        unverified: [],
        basic: ['Verify phone number'],
        standard: ['Verify phone number', 'Verify email', 'Upload and verify ID document'],
        enhanced: ['Verify phone number', 'Verify email', 'Upload and verify ID document', 'Verify address'],
        premium: ['Verify phone number', 'Verify email', 'Upload and verify ID document', 'Verify address', 'Complete biometric verification'],
      };

      return {
        tier: input.tier,
        requirements: requirements[input.tier],
        limits: {
          dailyLimit: limits.dailyLimit,
          monthlyLimit: limits.monthlyLimit,
          singleLimit: limits.singleLimit,
          maxLoan: limits.maxLoan,
        },
        features: {
          canTrade: limits.canTrade,
          canBorrow: limits.canBorrow,
          canWithdraw: limits.canWithdraw,
        },
      };
    }),

  // ==================== Admin Operations ====================

  // Get pending KYC reviews (admin)
  getPendingReviews: protectedProcedure
    .input(z.object({
      status: kycStatusSchema.optional(),
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input, ctx }) => {
      if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'compliance_officer') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      // Fetch pending KYC profiles from database
      const statusFilter = input.status || 'pending';
      const profiles = await db.select().from(userKycProfiles)
        .where(eq(userKycProfiles.status, statusFilter))
        .orderBy(desc(userKycProfiles.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return {
        reviews: profiles.map(p => ({
          id: p.id,
          userId: p.userId,
          currentTier: p.currentTier,
          status: p.status,
          legalFirstName: p.legalFirstName,
          legalLastName: p.legalLastName,
          phoneVerified: p.phoneVerified,
          emailVerified: p.emailVerified,
          idVerified: p.idVerified,
          riskScore: p.riskScore,
          createdAt: p.createdAt.toISOString(),
        })),
        total: profiles.length,
      };
    }),

  // Approve KYC (admin)
  approveKyc: protectedProcedure
    .input(z.object({
      userId: z.number(),
      notes: z.string().optional(),
      newTier: kycTierSchema.optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'compliance_officer') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      // Get current profile
      const [profile] = await db.select().from(userKycProfiles)
        .where(eq(userKycProfiles.userId, input.userId)).limit(1);
      
      if (!profile) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'KYC profile not found' });
      }

      const newTier = input.newTier || profile.currentTier;

      // Update profile status
      await db.update(userKycProfiles).set({
        status: 'approved',
        currentTier: newTier,
        verificationNotes: input.notes,
        verifiedBy: ctx.user?.id ? Number(ctx.user.id) : undefined,
        lastVerificationDate: new Date(),
        updatedAt: new Date(),
      }).where(eq(userKycProfiles.userId, input.userId));

      // Create audit log entry
      await db.insert(kycVerificationHistory).values({
        userId: input.userId,
        kycProfileId: profile.id,
        previousTier: profile.currentTier,
        newTier: newTier,
        previousStatus: profile.status,
        newStatus: 'approved',
        action: 'kyc_approved',
        reason: input.notes || 'KYC approved by admin',
        performedBy: ctx.user?.id ? Number(ctx.user.id) : undefined,
      });

      return {
        success: true,
        message: 'KYC approved successfully',
        newStatus: 'approved' as KycStatus,
        newTier: newTier as KycTier,
      };
    }),

  // Reject KYC (admin)
  rejectKyc: protectedProcedure
    .input(z.object({
      userId: z.number(),
      reason: z.string().min(10),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'compliance_officer') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      // Get current profile
      const [profile] = await db.select().from(userKycProfiles)
        .where(eq(userKycProfiles.userId, input.userId)).limit(1);
      
      if (!profile) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'KYC profile not found' });
      }

      // Update profile status
      await db.update(userKycProfiles).set({
        status: 'rejected',
        rejectionReason: input.reason,
        verificationNotes: input.notes,
        verifiedBy: ctx.user?.id ? Number(ctx.user.id) : undefined,
        lastVerificationDate: new Date(),
        updatedAt: new Date(),
      }).where(eq(userKycProfiles.userId, input.userId));

      // Create audit log entry
      await db.insert(kycVerificationHistory).values({
        userId: input.userId,
        kycProfileId: profile.id,
        previousStatus: profile.status,
        newStatus: 'rejected',
        action: 'kyc_rejected',
        reason: input.reason,
        metadata: input.notes ? { notes: input.notes } : undefined,
        performedBy: ctx.user?.id ? Number(ctx.user.id) : undefined,
      });

      return {
        success: true,
        message: 'KYC rejected',
        newStatus: 'rejected' as KycStatus,
        reason: input.reason,
      };
    }),

  // Suspend user KYC (admin)
  suspendKyc: protectedProcedure
    .input(z.object({
      userId: z.number(),
      reason: z.string().min(10),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'compliance_officer') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      // Get current profile
      const [profile] = await db.select().from(userKycProfiles)
        .where(eq(userKycProfiles.userId, input.userId)).limit(1);
      
      if (!profile) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'KYC profile not found' });
      }

      // Update profile status
      await db.update(userKycProfiles).set({
        status: 'suspended',
        verificationNotes: input.reason,
        updatedAt: new Date(),
      }).where(eq(userKycProfiles.userId, input.userId));

      // Create audit log entry
      await db.insert(kycVerificationHistory).values({
        userId: input.userId,
        kycProfileId: profile.id,
        previousStatus: profile.status,
        newStatus: 'suspended',
        action: 'kyc_suspended',
        reason: input.reason,
        performedBy: ctx.user?.id ? Number(ctx.user.id) : undefined,
      });

      return {
        success: true,
        message: 'KYC suspended',
        newStatus: 'suspended' as KycStatus,
      };
    }),

  // Get KYC audit history (admin)
  getAuditHistory: protectedProcedure
    .input(z.object({
      userId: z.number(),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ input, ctx }) => {
      if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'compliance_officer') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      // Fetch audit history from database
      const history = await db.select().from(kycVerificationHistory)
        .where(eq(kycVerificationHistory.userId, input.userId))
        .orderBy(desc(kycVerificationHistory.performedAt))
        .limit(input.limit);

      return {
        history: history.map(h => ({
          id: h.id,
          action: h.action,
          previousTier: h.previousTier,
          newTier: h.newTier,
          previousStatus: h.previousStatus,
          newStatus: h.newStatus,
          reason: h.reason,
          performedBy: h.performedBy,
          performedAt: h.performedAt.toISOString(),
          metadata: h.metadata,
        })),
        total: history.length,
      };
    }),

  // ==================== Compliance Checks ====================

  // Check if user can perform action
  checkActionPermission: protectedProcedure
    .input(z.object({
      action: z.enum(['trade', 'borrow', 'withdraw', 'transfer']),
      amount: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      // Fetch user's current tier from database
      const [profile] = await db.select().from(userKycProfiles)
        .where(eq(userKycProfiles.userId, Number(userId))).limit(1);
      
      const currentTier: KycTier = (profile?.currentTier as KycTier) || 'unverified';

      const result = kycService.canPerformAction(currentTier, input.action, input.amount);

      return {
        allowed: result.allowed,
        reason: result.reason,
        currentTier,
        requiredTier: result.allowed ? currentTier : 'standard', // Suggest upgrade
      };
    }),

  // Get compliance summary for user
  getComplianceSummary: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      // Fetch profile from database
      const [profile] = await db.select().from(userKycProfiles)
        .where(eq(userKycProfiles.userId, Number(userId))).limit(1);

      if (!profile) {
        return {
          kycComplete: false,
          kycTier: 'unverified' as KycTier,
          kycStatus: 'pending' as KycStatus,
          sanctionsCleared: true,
          pepStatus: false,
          riskLevel: 'unknown',
          lastReviewDate: null,
          nextReviewDate: null,
          pendingActions: ['Complete KYC verification'],
        };
      }

      // Calculate pending actions based on profile
      const pendingActions: string[] = [];
      if (!profile.phoneVerified) pendingActions.push('Verify phone number');
      if (!profile.emailVerified) pendingActions.push('Verify email');
      if (!profile.idVerified) pendingActions.push('Upload ID document');
      if (!profile.addressVerified) pendingActions.push('Verify address');
      if (!profile.biometricVerified && profile.currentTier === 'premium') {
        pendingActions.push('Complete biometric verification');
      }

      const kycComplete = profile.status === 'approved' && 
        profile.phoneVerified && profile.emailVerified && profile.idVerified;

      return {
        kycComplete,
        kycTier: profile.currentTier as KycTier,
        kycStatus: profile.status as KycStatus,
        sanctionsCleared: !profile.sanctionsMatch,
        pepStatus: profile.pepStatus ?? false,
        riskLevel: profile.riskLevel || 'unknown',
        lastReviewDate: profile.lastVerificationDate?.toISOString() || null,
        nextReviewDate: profile.nextReviewDate?.toISOString() || null,
        pendingActions,
      };
    }),
});

export default kycRouter;
