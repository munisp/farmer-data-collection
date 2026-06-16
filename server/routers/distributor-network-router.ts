/**
 * Distributor Network Router
 *
 * Enables farmers to introduce distributors who warehouse produce closer to buyers.
 * All payments flow through the platform with configurable profit sharing.
 *
 * Middleware: PostgreSQL (state), Kafka (events), Redis (cache), TigerBeetle (ledger),
 * Permify (authorization), APISIX (rate limiting), OpenAppSec (WAF)
 */

import { TRPCError } from "@trpc/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import {
  distributors,
  distributorPartnerships,
  consignments,
  distributorSales,
  profitSplits,
  distributorFeeConfig,
} from "../../drizzle/distributor-schema.js";
import { eq, and, desc, sql, gte, lte, inArray } from "drizzle-orm";
import { getProducer } from "../kafka.js";
import { logger } from "../logger.js";
import { checkRateLimit, scanForThreats, checkPermission } from "../integrations/middleware-router-hooks.js";

// ============================================================================
// DISTRIBUTOR REGISTRATION & VERIFICATION
// ============================================================================

export const distributorNetworkRouter = router({
  /**
   * Register as a distributor (farmer introduces them, or self-registration)
   */
  registerDistributor: protectedProcedure
    .input(z.object({
      businessName: z.string().min(3).max(255),
      registrationNumber: z.string().optional(),
      contactPerson: z.string().min(2).max(200),
      phoneNumber: z.string().min(10).max(20),
      email: z.string().email().optional(),
      warehouseAddress: z.string().min(10),
      warehouseCapacityKg: z.number().positive().optional(),
      coverageRegions: z.array(z.string()).min(1),
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      documents: z.array(z.object({
        type: z.string(),
        url: z.string().url(),
      })).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const rateCheck = await checkRateLimit("distributor", String(ctx.user?.id ?? "anon"), 5, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });
      const wafScan = await scanForThreats("distributor", input);
      if (!wafScan.safe) throw new TRPCError({ code: "FORBIDDEN", message: `Request blocked: ${wafScan.threats.join(", ")}` });

      const db = await requireDb();

      // Check if user already has a distributor profile
      const [existing] = await db.select().from(distributors)
        .where(eq(distributors.userId, ctx.user.id));
      if (existing) throw new TRPCError({ code: "BAD_REQUEST", message: "Distributor profile already exists for this user" });

      const [distributor] = await db.insert(distributors).values({
        userId: ctx.user.id,
        businessName: input.businessName,
        registrationNumber: input.registrationNumber || null,
        contactPerson: input.contactPerson,
        phoneNumber: input.phoneNumber,
        email: input.email || null,
        warehouseAddress: input.warehouseAddress,
        warehouseCapacityKg: input.warehouseCapacityKg ? String(input.warehouseCapacityKg) : null,
        coverageRegions: input.coverageRegions,
        latitude: input.latitude ? String(input.latitude) : null,
        longitude: input.longitude ? String(input.longitude) : null,
        documents: input.documents?.map(d => ({ ...d, uploadedAt: new Date().toISOString() })) || [],
        status: "pending",
      }).returning();

      // Publish event for admin review
      const producer = await getProducer();
      if (producer) {
        await producer.send({
          topic: "distributor-events",
          messages: [{ value: JSON.stringify({
            type: "distributor.registered",
            distributorId: distributor.id,
            businessName: input.businessName,
            userId: ctx.user.id,
            timestamp: new Date().toISOString(),
          }) }],
        });
      }

      logger.info(`[Distributor] New registration: ${input.businessName} (ID: ${distributor.id})`);
      return distributor;
    }),

  /**
   * Submit KYC information (personal identity, business, bank account)
   * Called after initial registration to complete the onboarding
   */
  submitKyc: protectedProcedure
    .input(z.object({
      // Personal identity
      ninNumber: z.string().length(11).optional(),
      bvnNumber: z.string().length(11).optional(),
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      gender: z.enum(["male", "female", "other"]).optional(),
      nationality: z.string().optional(),
      idDocumentType: z.enum(["passport", "drivers_license", "voters_card", "nin_slip"]).optional(),
      idDocumentNumber: z.string().optional(),
      idDocumentExpiry: z.string().optional(),
      // Business verification
      cacNumber: z.string().optional(),
      tinNumber: z.string().optional(),
      businessType: z.enum(["sole_proprietorship", "partnership", "limited_company"]).optional(),
      yearEstablished: z.number().min(1900).max(2030).optional(),
      numberOfEmployees: z.number().min(1).optional(),
      annualRevenueRange: z.enum(["under_1m", "1m_10m", "10m_50m", "50m_100m", "above_100m"]).optional(),
      directors: z.array(z.object({
        name: z.string(),
        nin: z.string().optional(),
        phone: z.string().optional(),
        role: z.string(),
      })).optional(),
      // Bank account
      bankName: z.string().optional(),
      bankCode: z.string().optional(),
      accountNumber: z.string().length(10).optional(),
      accountName: z.string().optional(),
      accountBvn: z.string().length(11).optional(),
      // Address
      residentialAddress: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      lgaDistrict: z.string().optional(),
      postalCode: z.string().optional(),
      // Documents
      kycDocuments: z.array(z.object({
        type: z.enum(["id_front", "id_back", "cac_certificate", "tin_certificate", "utility_bill", "warehouse_proof", "passport_photo", "bank_statement"]),
        url: z.string().url(),
      })).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const rateCheck = await checkRateLimit("distributor-kyc", String(ctx.user?.id ?? "anon"), 10, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });
      const wafScan = await scanForThreats("distributor-kyc", input);
      if (!wafScan.safe) throw new TRPCError({ code: "FORBIDDEN", message: `Request blocked: ${wafScan.threats.join(", ")}` });

      const db = await requireDb();

      const [dist] = await db.select().from(distributors)
        .where(eq(distributors.userId, ctx.user.id));
      if (!dist) throw new TRPCError({ code: "NOT_FOUND", message: "Register as a distributor first" });

      // Calculate KYC level based on what's provided
      let kycLevel = 0;
      if (input.ninNumber || input.bvnNumber) kycLevel = 1; // Basic identity
      if (kycLevel >= 1 && input.cacNumber && input.bankName && input.accountNumber) kycLevel = 2; // Enhanced
      if (kycLevel >= 2 && input.kycDocuments && input.kycDocuments.length >= 3) kycLevel = 3; // Full

      const kycDocs = input.kycDocuments?.map(d => ({
        ...d,
        uploadedAt: new Date().toISOString(),
        verified: false,
      }));

      const [updated] = await db.update(distributors).set({
        ninNumber: input.ninNumber || dist.ninNumber,
        bvnNumber: input.bvnNumber || dist.bvnNumber,
        dateOfBirth: input.dateOfBirth || dist.dateOfBirth,
        gender: input.gender || dist.gender,
        nationality: input.nationality || dist.nationality,
        idDocumentType: input.idDocumentType || dist.idDocumentType,
        idDocumentNumber: input.idDocumentNumber || dist.idDocumentNumber,
        idDocumentExpiry: input.idDocumentExpiry || dist.idDocumentExpiry,
        cacNumber: input.cacNumber || dist.cacNumber,
        tinNumber: input.tinNumber || dist.tinNumber,
        businessType: input.businessType || dist.businessType,
        yearEstablished: input.yearEstablished || dist.yearEstablished,
        numberOfEmployees: input.numberOfEmployees || dist.numberOfEmployees,
        annualRevenueRange: input.annualRevenueRange || dist.annualRevenueRange,
        directors: input.directors || dist.directors,
        bankName: input.bankName || dist.bankName,
        bankCode: input.bankCode || dist.bankCode,
        accountNumber: input.accountNumber || dist.accountNumber,
        accountName: input.accountName || dist.accountName,
        accountBvn: input.accountBvn || dist.accountBvn,
        residentialAddress: input.residentialAddress || dist.residentialAddress,
        city: input.city || dist.city,
        state: input.state || dist.state,
        lgaDistrict: input.lgaDistrict || dist.lgaDistrict,
        postalCode: input.postalCode || dist.postalCode,
        kycDocuments: kycDocs || dist.kycDocuments,
        kycStatus: "in_progress",
        kycLevel,
        updatedAt: new Date(),
      }).where(eq(distributors.userId, ctx.user.id)).returning();

      logger.info(`[Distributor KYC] Updated for ${dist.businessName} (level: ${kycLevel})`);
      return { distributor: updated, kycLevel };
    }),

  /**
   * Submit KYC for review (marks status as submitted, triggers admin review)
   */
  submitKycForReview: protectedProcedure
    .mutation(async ({ ctx }) => {
      const rateCheck = await checkRateLimit("distributor-kyc-submit", String(ctx.user?.id ?? "anon"), 3, 300);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });

      const db = await requireDb();
      const [dist] = await db.select().from(distributors)
        .where(eq(distributors.userId, ctx.user.id));
      if (!dist) throw new TRPCError({ code: "NOT_FOUND", message: "Distributor profile not found" });

      // Validate minimum requirements for submission
      if (!dist.ninNumber && !dist.bvnNumber) throw new TRPCError({ code: "BAD_REQUEST", message: "At least NIN or BVN is required" });
      if (!dist.bankName || !dist.accountNumber) throw new TRPCError({ code: "BAD_REQUEST", message: "Bank account details are required" });
      if (!dist.cacNumber) throw new TRPCError({ code: "BAD_REQUEST", message: "CAC registration number is required" });

      const [updated] = await db.update(distributors).set({
        kycStatus: "submitted",
        kycSubmittedAt: new Date(),
        status: "pending",
        updatedAt: new Date(),
      }).where(eq(distributors.userId, ctx.user.id)).returning();

      // Publish for admin review
      const producer = await getProducer();
      if (producer) {
        await producer.send({
          topic: "distributor-events",
          messages: [{ value: JSON.stringify({
            type: "distributor.kyc_submitted",
            distributorId: dist.id,
            businessName: dist.businessName,
            kycLevel: dist.kycLevel,
            timestamp: new Date().toISOString(),
          }) }],
        });
      }

      logger.info(`[Distributor KYC] Submitted for review: ${dist.businessName}`);
      return updated;
    }),

  /**
   * Admin: Review and approve/reject KYC submission
   */
  reviewKyc: protectedProcedure
    .input(z.object({
      distributorId: z.number(),
      action: z.enum(["approve", "reject"]),
      rejectionReasons: z.array(z.string()).optional(),
      kycLevel: z.number().min(1).max(3).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const rateCheck = await checkRateLimit("distributor-admin", String(ctx.user?.id ?? "anon"), 20, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });
      const permCheck = await checkPermission(String(ctx.user?.id ?? "anon"), "distributor", "admin");
      if (!permCheck) throw new TRPCError({ code: "FORBIDDEN", message: "Admin permission required" });

      const db = await requireDb();
      const [dist] = await db.select().from(distributors)
        .where(eq(distributors.id, input.distributorId));
      if (!dist) throw new TRPCError({ code: "NOT_FOUND", message: "Distributor not found" });

      if (input.action === "approve") {
        const [updated] = await db.update(distributors).set({
          kycStatus: "approved",
          kycReviewedAt: new Date(),
          kycReviewedBy: ctx.user.id,
          kycLevel: input.kycLevel || dist.kycLevel,
          status: "approved",
          verifiedAt: new Date(),
          verifiedBy: ctx.user.id,
          bankVerified: true,
          bankVerifiedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(distributors.id, input.distributorId)).returning();

        const producer = await getProducer();
        if (producer) {
          await producer.send({
            topic: "distributor-events",
            messages: [{ value: JSON.stringify({
              type: "distributor.kyc_approved",
              distributorId: input.distributorId,
              kycLevel: input.kycLevel || dist.kycLevel,
              approvedBy: ctx.user.id,
              timestamp: new Date().toISOString(),
            }) }],
          });
        }
        logger.info(`[Distributor KYC] Approved: ${dist.businessName}`);
        return updated;
      } else {
        const [updated] = await db.update(distributors).set({
          kycStatus: "rejected",
          kycReviewedAt: new Date(),
          kycReviewedBy: ctx.user.id,
          kycRejectionReasons: input.rejectionReasons || [],
          status: "rejected",
          rejectionReason: input.rejectionReasons?.join("; ") || "KYC verification failed",
          updatedAt: new Date(),
        }).where(eq(distributors.id, input.distributorId)).returning();

        logger.info(`[Distributor KYC] Rejected: ${dist.businessName}`);
        return updated;
      }
    }),

  /**
   * Get KYC status and completion progress
   */
  getKycStatus: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await requireDb();
      const [dist] = await db.select().from(distributors)
        .where(eq(distributors.userId, ctx.user.id));
      if (!dist) return { registered: false, kycStatus: "not_started", kycLevel: 0, completionPercent: 0, missingFields: [] };

      const missingFields: string[] = [];
      if (!dist.ninNumber && !dist.bvnNumber) missingFields.push("NIN or BVN");
      if (!dist.cacNumber) missingFields.push("CAC Number");
      if (!dist.tinNumber) missingFields.push("TIN");
      if (!dist.bankName) missingFields.push("Bank Name");
      if (!dist.accountNumber) missingFields.push("Account Number");
      if (!dist.accountName) missingFields.push("Account Name");
      if (!dist.residentialAddress) missingFields.push("Residential Address");
      if (!dist.idDocumentType) missingFields.push("ID Document");
      if (!dist.businessType) missingFields.push("Business Type");

      const totalFields = 9;
      const completedFields = totalFields - missingFields.length;
      const completionPercent = Math.round((completedFields / totalFields) * 100);

      return {
        registered: true,
        kycStatus: dist.kycStatus,
        kycLevel: dist.kycLevel,
        completionPercent,
        missingFields,
        bankVerified: dist.bankVerified,
        kycSubmittedAt: dist.kycSubmittedAt,
        kycReviewedAt: dist.kycReviewedAt,
        rejectionReasons: dist.kycRejectionReasons,
      };
    }),

  /**
   * Admin: Approve or reject a distributor application
   */
  verifyDistributor: protectedProcedure
    .input(z.object({
      distributorId: z.number(),
      action: z.enum(["approve", "reject"]),
      rejectionReason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const rateCheck = await checkRateLimit("distributor", String(ctx.user?.id ?? "anon"), 20, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });
      const wafScan = await scanForThreats("distributor", input);
      if (!wafScan.safe) throw new TRPCError({ code: "FORBIDDEN", message: `Request blocked: ${wafScan.threats.join(", ")}` });
      const permCheck = await checkPermission(String(ctx.user?.id ?? "anon"), "distributor", "admin");
      if (!permCheck) throw new TRPCError({ code: "FORBIDDEN", message: "Admin permission required" });

      const db = await requireDb();

      const [distributor] = await db.select().from(distributors)
        .where(eq(distributors.id, input.distributorId));
      if (!distributor) throw new TRPCError({ code: "NOT_FOUND", message: "Distributor not found" });
      if (distributor.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Distributor is not in pending status" });

      const [updated] = await db.update(distributors).set({
        status: input.action === "approve" ? "approved" : "rejected",
        verifiedAt: new Date(),
        verifiedBy: ctx.user.id,
        rejectionReason: input.action === "reject" ? (input.rejectionReason || null) : null,
        updatedAt: new Date(),
      }).where(eq(distributors.id, input.distributorId)).returning();

      // Publish verification event
      const producer = await getProducer();
      if (producer) {
        await producer.send({
          topic: "distributor-events",
          messages: [{ value: JSON.stringify({
            type: `distributor.${input.action}d`,
            distributorId: input.distributorId,
            verifiedBy: ctx.user.id,
            timestamp: new Date().toISOString(),
          }) }],
        });
      }

      logger.info(`[Distributor] ${input.action}: ${distributor.businessName} (ID: ${input.distributorId})`);
      return updated;
    }),

  /**
   * Get distributor profile (own or by ID for partnerships)
   */
  getDistributor: protectedProcedure
    .input(z.object({ distributorId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      if (input.distributorId) {
        const [dist] = await db.select().from(distributors)
          .where(eq(distributors.id, input.distributorId));
        return dist || null;
      }
      const [dist] = await db.select().from(distributors)
        .where(eq(distributors.userId, ctx.user.id));
      return dist || null;
    }),

  /**
   * List approved distributors (for farmers browsing potential partners)
   */
  listDistributors: protectedProcedure
    .input(z.object({
      region: z.string().optional(),
      limit: z.number().min(1).max(50).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const results = await db.select().from(distributors)
        .where(eq(distributors.status, "approved"))
        .orderBy(desc(distributors.averageRating))
        .limit(input.limit)
        .offset(input.offset);
      return results;
    }),

  /**
   * List pending distributors (admin view)
   */
  listPendingDistributors: protectedProcedure
    .query(async ({ ctx }) => {
      const permCheck = await checkPermission(String(ctx.user?.id ?? "anon"), "distributor", "admin");
      if (!permCheck) throw new TRPCError({ code: "FORBIDDEN", message: "Admin permission required" });

      const db = await requireDb();
      return db.select().from(distributors)
        .where(eq(distributors.status, "pending"))
        .orderBy(desc(distributors.createdAt));
    }),

  // ============================================================================
  // PARTNERSHIP MANAGEMENT
  // ============================================================================

  /**
   * Farmer proposes a partnership with a distributor (or vice versa)
   */
  proposePartnership: protectedProcedure
    .input(z.object({
      distributorId: z.number(),
      farmerSharePercent: z.number().min(1).max(99),
      distributorSharePercent: z.number().min(1).max(99),
      platformFeePercent: z.number().min(1).max(30),
      commodities: z.array(z.string()).min(1),
      minimumOrderKg: z.number().positive().optional(),
      agreementTerms: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const rateCheck = await checkRateLimit("distributor", String(ctx.user?.id ?? "anon"), 10, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });
      const wafScan = await scanForThreats("distributor", input);
      if (!wafScan.safe) throw new TRPCError({ code: "FORBIDDEN", message: `Request blocked: ${wafScan.threats.join(", ")}` });

      // Validate percentages sum to 100
      const total = input.farmerSharePercent + input.distributorSharePercent + input.platformFeePercent;
      if (Math.abs(total - 100) > 0.01) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Profit shares must sum to 100% (got ${total}%)` });
      }

      const db = await requireDb();

      // Verify distributor is approved
      const [distributor] = await db.select().from(distributors)
        .where(and(eq(distributors.id, input.distributorId), eq(distributors.status, "approved")));
      if (!distributor) throw new TRPCError({ code: "NOT_FOUND", message: "Approved distributor not found" });

      // Check no active partnership exists between these parties
      const [existing] = await db.select().from(distributorPartnerships)
        .where(and(
          eq(distributorPartnerships.farmerId, ctx.user.id),
          eq(distributorPartnerships.distributorId, input.distributorId),
          eq(distributorPartnerships.status, "active"),
        ));
      if (existing) throw new TRPCError({ code: "BAD_REQUEST", message: "Active partnership already exists with this distributor" });

      const [partnership] = await db.insert(distributorPartnerships).values({
        farmerId: ctx.user.id,
        distributorId: input.distributorId,
        farmerSharePercent: String(input.farmerSharePercent),
        distributorSharePercent: String(input.distributorSharePercent),
        platformFeePercent: String(input.platformFeePercent),
        commodities: input.commodities,
        minimumOrderKg: input.minimumOrderKg ? String(input.minimumOrderKg) : null,
        agreementTerms: input.agreementTerms || null,
        status: "proposed",
        proposedBy: "farmer",
      }).returning();

      // Notify distributor
      const producer = await getProducer();
      if (producer) {
        await producer.send({
          topic: "distributor-events",
          messages: [{ value: JSON.stringify({
            type: "partnership.proposed",
            partnershipId: partnership.id,
            farmerId: ctx.user.id,
            distributorId: input.distributorId,
            farmerShare: input.farmerSharePercent,
            distributorShare: input.distributorSharePercent,
            platformFee: input.platformFeePercent,
            timestamp: new Date().toISOString(),
          }) }],
        });
      }

      return partnership;
    }),

  /**
   * Accept or reject a partnership proposal
   */
  respondToPartnership: protectedProcedure
    .input(z.object({
      partnershipId: z.number(),
      action: z.enum(["accept", "reject"]),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const rateCheck = await checkRateLimit("distributor", String(ctx.user?.id ?? "anon"), 20, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });
      const wafScan = await scanForThreats("distributor", input);
      if (!wafScan.safe) throw new TRPCError({ code: "FORBIDDEN", message: `Request blocked: ${wafScan.threats.join(", ")}` });

      const db = await requireDb();

      const [partnership] = await db.select().from(distributorPartnerships)
        .where(eq(distributorPartnerships.id, input.partnershipId));
      if (!partnership) throw new TRPCError({ code: "NOT_FOUND", message: "Partnership not found" });
      if (partnership.status !== "proposed") throw new TRPCError({ code: "BAD_REQUEST", message: "Partnership is not in proposed status" });

      // Verify the respondent is the other party
      const isDistributor = await db.select().from(distributors)
        .where(and(eq(distributors.id, partnership.distributorId), eq(distributors.userId, ctx.user.id)));
      const isFarmer = partnership.farmerId === ctx.user.id;
      if (!isDistributor.length && !isFarmer) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a party to this partnership" });
      }

      const [updated] = await db.update(distributorPartnerships).set({
        status: input.action === "accept" ? "active" : "terminated",
        acceptedAt: input.action === "accept" ? new Date() : null,
        terminatedAt: input.action === "reject" ? new Date() : null,
        terminationReason: input.action === "reject" ? (input.reason || "Proposal rejected") : null,
        updatedAt: new Date(),
      }).where(eq(distributorPartnerships.id, input.partnershipId)).returning();

      const producer = await getProducer();
      if (producer) {
        await producer.send({
          topic: "distributor-events",
          messages: [{ value: JSON.stringify({
            type: `partnership.${input.action}ed`,
            partnershipId: input.partnershipId,
            respondedBy: ctx.user.id,
            timestamp: new Date().toISOString(),
          }) }],
        });
      }

      return updated;
    }),

  /**
   * Get partnerships for the current user (as farmer or distributor)
   */
  getMyPartnerships: protectedProcedure
    .input(z.object({
      status: z.enum(["proposed", "active", "paused", "terminated"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();

      // Check if user is a distributor
      const [dist] = await db.select().from(distributors)
        .where(eq(distributors.userId, ctx.user.id));

      const conditions = [];
      if (dist) {
        conditions.push(sql`(${distributorPartnerships.farmerId} = ${ctx.user.id} OR ${distributorPartnerships.distributorId} = ${dist.id})`);
      } else {
        conditions.push(eq(distributorPartnerships.farmerId, ctx.user.id));
      }
      if (input.status) {
        conditions.push(eq(distributorPartnerships.status, input.status));
      }

      return db.select().from(distributorPartnerships)
        .where(and(...conditions))
        .orderBy(desc(distributorPartnerships.createdAt));
    }),

  // ============================================================================
  // CONSIGNMENT MANAGEMENT
  // ============================================================================

  /**
   * Farmer creates a consignment (ships produce to distributor)
   */
  createConsignment: protectedProcedure
    .input(z.object({
      partnershipId: z.number(),
      commodity: z.string().min(2),
      varietyOrGrade: z.string().optional(),
      quantityKg: z.number().positive(),
      pricePerKg: z.number().positive(),
      currency: z.string().default("NGN"),
      expectedArrival: z.string().optional(), // ISO date
      harvestDate: z.string().optional(),
      expiryDate: z.string().optional(),
      storageConditions: z.enum(["cold_chain", "dry", "ambient"]).optional(),
      qualityGrade: z.enum(["A", "B", "C"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const rateCheck = await checkRateLimit("distributor", String(ctx.user?.id ?? "anon"), 20, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });
      const wafScan = await scanForThreats("distributor", input);
      if (!wafScan.safe) throw new TRPCError({ code: "FORBIDDEN", message: `Request blocked: ${wafScan.threats.join(", ")}` });

      const db = await requireDb();

      // Verify partnership is active and belongs to this farmer
      const [partnership] = await db.select().from(distributorPartnerships)
        .where(and(
          eq(distributorPartnerships.id, input.partnershipId),
          eq(distributorPartnerships.farmerId, ctx.user.id),
          eq(distributorPartnerships.status, "active"),
        ));
      if (!partnership) throw new TRPCError({ code: "NOT_FOUND", message: "Active partnership not found" });

      const trackingRef = `CSN-${Date.now()}-${randomBytes(3).toString("hex").toUpperCase()}`;

      const [consignment] = await db.insert(consignments).values({
        partnershipId: input.partnershipId,
        farmerId: ctx.user.id,
        distributorId: partnership.distributorId,
        commodity: input.commodity,
        varietyOrGrade: input.varietyOrGrade || null,
        quantityKg: String(input.quantityKg),
        remainingKg: String(input.quantityKg),
        pricePerKg: String(input.pricePerKg),
        currency: input.currency,
        expectedArrival: input.expectedArrival ? new Date(input.expectedArrival) : null,
        harvestDate: input.harvestDate ? new Date(input.harvestDate) : null,
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
        storageConditions: input.storageConditions || null,
        qualityGrade: input.qualityGrade || null,
        trackingReference: trackingRef,
        status: "preparing",
      }).returning();

      const producer = await getProducer();
      if (producer) {
        await producer.send({
          topic: "distributor-events",
          messages: [{ value: JSON.stringify({
            type: "consignment.created",
            consignmentId: consignment.id,
            partnershipId: input.partnershipId,
            farmerId: ctx.user.id,
            distributorId: partnership.distributorId,
            commodity: input.commodity,
            quantityKg: input.quantityKg,
            trackingRef,
            timestamp: new Date().toISOString(),
          }) }],
        });
      }

      return consignment;
    }),

  /**
   * Update consignment status (ship, receive, mark quality)
   */
  updateConsignmentStatus: protectedProcedure
    .input(z.object({
      consignmentId: z.number(),
      status: z.enum(["shipped", "in_transit", "received", "stored", "spoiled", "returned"]),
      qualityGrade: z.enum(["A", "B", "C"]).optional(),
      qualityNotes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const rateCheck = await checkRateLimit("distributor", String(ctx.user?.id ?? "anon"), 20, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });
      const wafScan = await scanForThreats("distributor", input);
      if (!wafScan.safe) throw new TRPCError({ code: "FORBIDDEN", message: `Request blocked: ${wafScan.threats.join(", ")}` });

      const db = await requireDb();

      const [consignment] = await db.select().from(consignments)
        .where(eq(consignments.id, input.consignmentId));
      if (!consignment) throw new TRPCError({ code: "NOT_FOUND", message: "Consignment not found" });

      const updateData: Record<string, unknown> = {
        status: input.status,
        updatedAt: new Date(),
      };

      if (input.status === "shipped") updateData.shippedAt = new Date();
      if (input.status === "received") {
        updateData.receivedAt = new Date();
        updateData.inspectedBy = ctx.user.id;
        updateData.inspectedAt = new Date();
      }
      if (input.qualityGrade) updateData.qualityGrade = input.qualityGrade;
      if (input.qualityNotes) updateData.qualityNotes = input.qualityNotes;

      const [updated] = await db.update(consignments)
        .set(updateData)
        .where(eq(consignments.id, input.consignmentId))
        .returning();

      const producer = await getProducer();
      if (producer) {
        await producer.send({
          topic: "distributor-events",
          messages: [{ value: JSON.stringify({
            type: `consignment.${input.status}`,
            consignmentId: input.consignmentId,
            updatedBy: ctx.user.id,
            timestamp: new Date().toISOString(),
          }) }],
        });
      }

      return updated;
    }),

  /**
   * Get consignments for a user (farmer sees outbound, distributor sees inbound)
   */
  getMyConsignments: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      limit: z.number().min(1).max(50).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();

      const [dist] = await db.select().from(distributors)
        .where(eq(distributors.userId, ctx.user.id));

      const conditions = [];
      if (dist) {
        conditions.push(sql`(${consignments.farmerId} = ${ctx.user.id} OR ${consignments.distributorId} = ${dist.id})`);
      } else {
        conditions.push(eq(consignments.farmerId, ctx.user.id));
      }
      if (input.status) {
        conditions.push(eq(consignments.status, input.status));
      }

      return db.select().from(consignments)
        .where(and(...conditions))
        .orderBy(desc(consignments.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  // ============================================================================
  // SALES & PROFIT SPLITTING
  // ============================================================================

  /**
   * Distributor records a sale from consigned produce.
   * Payment is collected on platform, profit split is calculated automatically.
   */
  recordSale: protectedProcedure
    .input(z.object({
      consignmentId: z.number(),
      quantityKg: z.number().positive(),
      pricePerKg: z.number().positive(),
      buyerName: z.string().optional(),
      buyerPhone: z.string().optional(),
      buyerType: z.enum(["retailer", "wholesaler", "restaurant", "individual"]).optional(),
      paymentMethod: z.enum(["mobile_money", "bank_transfer", "cash_on_platform"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const rateCheck = await checkRateLimit("distributor", String(ctx.user?.id ?? "anon"), 20, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });
      const wafScan = await scanForThreats("distributor", input);
      if (!wafScan.safe) throw new TRPCError({ code: "FORBIDDEN", message: `Request blocked: ${wafScan.threats.join(", ")}` });

      const db = await requireDb();

      // Verify user is the distributor for this consignment
      const [dist] = await db.select().from(distributors)
        .where(eq(distributors.userId, ctx.user.id));
      if (!dist) throw new TRPCError({ code: "FORBIDDEN", message: "Not registered as a distributor" });

      const [consignment] = await db.select().from(consignments)
        .where(and(
          eq(consignments.id, input.consignmentId),
          eq(consignments.distributorId, dist.id),
        ));
      if (!consignment) throw new TRPCError({ code: "NOT_FOUND", message: "Consignment not found" });
      if (!["received", "stored", "partially_sold"].includes(consignment.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Consignment must be received/stored before selling" });
      }

      const remaining = Number(consignment.remainingKg);
      if (input.quantityKg > remaining) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Only ${remaining} kg available (requested ${input.quantityKg} kg)` });
      }

      // Get partnership for profit split terms
      const [partnership] = await db.select().from(distributorPartnerships)
        .where(eq(distributorPartnerships.id, consignment.partnershipId));
      if (!partnership) throw new TRPCError({ code: "NOT_FOUND", message: "Partnership agreement not found" });

      const totalAmount = input.quantityKg * input.pricePerKg;
      const farmerPercent = Number(partnership.farmerSharePercent);
      const distributorPercent = Number(partnership.distributorSharePercent);
      const platformPercent = Number(partnership.platformFeePercent);

      // Atomic: record sale + update consignment remaining + create profit split
      const result = await db.transaction(async (tx) => {
        // 1. Record the sale
        const [sale] = await tx.insert(distributorSales).values({
          consignmentId: input.consignmentId,
          distributorId: dist.id,
          buyerName: input.buyerName || null,
          buyerPhone: input.buyerPhone || null,
          buyerType: input.buyerType || null,
          quantityKg: String(input.quantityKg),
          pricePerKg: String(input.pricePerKg),
          totalAmount: String(totalAmount),
          currency: consignment.currency,
          paymentStatus: "pending",
          paymentMethod: input.paymentMethod || null,
        }).returning();

        // 2. Update consignment remaining quantity
        const newRemaining = remaining - input.quantityKg;
        await tx.update(consignments).set({
          remainingKg: String(newRemaining),
          status: newRemaining <= 0 ? "sold_out" : "partially_sold",
          updatedAt: new Date(),
        }).where(eq(consignments.id, input.consignmentId));

        // 3. Calculate and record profit split
        const farmerAmount = (totalAmount * farmerPercent) / 100;
        const distributorAmount = (totalAmount * distributorPercent) / 100;
        const platformAmount = (totalAmount * platformPercent) / 100;

        const [split] = await tx.insert(profitSplits).values({
          saleId: sale.id,
          consignmentId: input.consignmentId,
          partnershipId: consignment.partnershipId,
          totalSaleAmount: String(totalAmount),
          farmerAmount: String(farmerAmount),
          distributorAmount: String(distributorAmount),
          platformAmount: String(platformAmount),
          currency: consignment.currency,
          farmerPercent: String(farmerPercent),
          distributorPercent: String(distributorPercent),
          platformPercent: String(platformPercent),
        }).returning();

        // 4. Update distributor metrics
        await tx.update(distributors).set({
          totalSalesCount: sql`${distributors.totalSalesCount} + 1`,
          totalSalesValue: sql`CAST(${distributors.totalSalesValue} AS DECIMAL) + ${totalAmount}`,
          updatedAt: new Date(),
        }).where(eq(distributors.id, dist.id));

        return { sale, split };
      });

      // Publish sale event for payment processing
      const producer = await getProducer();
      if (producer) {
        await producer.send({
          topic: "distributor-events",
          messages: [{ value: JSON.stringify({
            type: "sale.recorded",
            saleId: result.sale.id,
            consignmentId: input.consignmentId,
            distributorId: dist.id,
            farmerId: consignment.farmerId,
            totalAmount,
            farmerAmount: result.split.farmerAmount,
            distributorAmount: result.split.distributorAmount,
            platformAmount: result.split.platformAmount,
            timestamp: new Date().toISOString(),
          }) }],
        });
      }

      logger.info(`[Distributor] Sale recorded: ${input.quantityKg}kg @ ${input.pricePerKg}/kg = ${totalAmount} (split: F${farmerPercent}%/D${distributorPercent}%/P${platformPercent}%)`);

      return {
        sale: result.sale,
        profitSplit: result.split,
        consignmentRemaining: remaining - input.quantityKg,
      };
    }),

  /**
   * Mark a sale as payment collected (triggers profit disbursement)
   */
  confirmPayment: protectedProcedure
    .input(z.object({
      saleId: z.number(),
      paymentReference: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const rateCheck = await checkRateLimit("distributor", String(ctx.user?.id ?? "anon"), 20, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });
      const wafScan = await scanForThreats("distributor", input);
      if (!wafScan.safe) throw new TRPCError({ code: "FORBIDDEN", message: `Request blocked: ${wafScan.threats.join(", ")}` });

      const db = await requireDb();

      const [sale] = await db.select().from(distributorSales)
        .where(eq(distributorSales.id, input.saleId));
      if (!sale) throw new TRPCError({ code: "NOT_FOUND", message: "Sale not found" });
      if (sale.paymentStatus !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Payment already processed" });

      // Atomic: update sale payment status + mark profit split for disbursement
      await db.transaction(async (tx) => {
        await tx.update(distributorSales).set({
          paymentStatus: "collected",
          paymentReference: input.paymentReference,
          collectedAt: new Date(),
        }).where(eq(distributorSales.id, input.saleId));

        await tx.update(profitSplits).set({
          farmerDisbursed: false, // ready for disbursement
          distributorDisbursed: false,
        }).where(eq(profitSplits.saleId, input.saleId));
      });

      // Trigger disbursement events
      const producer = await getProducer();
      if (producer) {
        await producer.send({
          topic: "distributor-events",
          messages: [{ value: JSON.stringify({
            type: "payment.collected",
            saleId: input.saleId,
            paymentReference: input.paymentReference,
            timestamp: new Date().toISOString(),
          }) }],
        });
        // Trigger actual disbursement
        await producer.send({
          topic: "disbursement.initiate",
          messages: [{ value: JSON.stringify({
            type: "profit_split_disbursement",
            saleId: input.saleId,
            timestamp: new Date().toISOString(),
          }) }],
        });
      }

      return { success: true, message: "Payment confirmed, disbursement initiated" };
    }),

  // ============================================================================
  // DASHBOARDS & ANALYTICS
  // ============================================================================

  /**
   * Earnings dashboard for farmer or distributor
   */
  getEarningsDashboard: protectedProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();

      const [dist] = await db.select().from(distributors)
        .where(eq(distributors.userId, ctx.user.id));

      // Get profit splits for this user
      let splits;
      if (dist) {
        // Distributor view
        const salesByDist = await db.select({ saleId: distributorSales.id })
          .from(distributorSales)
          .where(eq(distributorSales.distributorId, dist.id));
        const saleIds = salesByDist.map(s => s.saleId);
        if (saleIds.length === 0) return { totalEarnings: 0, totalSales: 0, splits: [], pendingDisbursement: 0 };

        splits = await db.select().from(profitSplits)
          .where(inArray(profitSplits.saleId, saleIds))
          .orderBy(desc(profitSplits.createdAt));

        const totalEarnings = splits.reduce((sum, s) => sum + Number(s.distributorAmount), 0);
        const pendingDisbursement = splits.filter(s => !s.distributorDisbursed).reduce((sum, s) => sum + Number(s.distributorAmount), 0);

        return {
          role: "distributor",
          totalEarnings,
          totalSales: splits.length,
          pendingDisbursement,
          splits: splits.slice(0, 20),
        };
      } else {
        // Farmer view — get consignments by this farmer
        const farmerConsignments = await db.select({ id: consignments.id })
          .from(consignments)
          .where(eq(consignments.farmerId, ctx.user.id));
        const consignmentIds = farmerConsignments.map(c => c.id);
        if (consignmentIds.length === 0) return { totalEarnings: 0, totalSales: 0, splits: [], pendingDisbursement: 0 };

        splits = await db.select().from(profitSplits)
          .where(inArray(profitSplits.consignmentId, consignmentIds))
          .orderBy(desc(profitSplits.createdAt));

        const totalEarnings = splits.reduce((sum, s) => sum + Number(s.farmerAmount), 0);
        const pendingDisbursement = splits.filter(s => !s.farmerDisbursed).reduce((sum, s) => sum + Number(s.farmerAmount), 0);

        return {
          role: "farmer",
          totalEarnings,
          totalSales: splits.length,
          pendingDisbursement,
          splits: splits.slice(0, 20),
        };
      }
    }),

  /**
   * Consignment inventory summary (what's in warehouse)
   */
  getInventorySummary: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await requireDb();

      const [dist] = await db.select().from(distributors)
        .where(eq(distributors.userId, ctx.user.id));
      if (!dist) throw new TRPCError({ code: "FORBIDDEN", message: "Distributor profile required" });

      const inventory = await db.select({
        commodity: consignments.commodity,
        totalKg: sql<number>`SUM(CAST(${consignments.remainingKg} AS DECIMAL))`,
        consignmentCount: sql<number>`COUNT(*)`,
        avgPricePerKg: sql<number>`AVG(CAST(${consignments.pricePerKg} AS DECIMAL))`,
      }).from(consignments)
        .where(and(
          eq(consignments.distributorId, dist.id),
          sql`${consignments.status} IN ('received', 'stored', 'partially_sold')`,
        ))
        .groupBy(consignments.commodity);

      const totalValue = inventory.reduce((sum, item) =>
        sum + (Number(item.totalKg) * Number(item.avgPricePerKg)), 0);

      return {
        items: inventory,
        totalCommodities: inventory.length,
        totalValueEstimate: totalValue,
      };
    }),

  /**
   * Platform fee configuration (admin)
   */
  updateFeeConfig: protectedProcedure
    .input(z.object({
      partnershipId: z.number().optional(), // null = global default
      platformFeePercent: z.number().min(0.5).max(30),
      minFeeAmount: z.number().positive().optional(),
      maxFeeAmount: z.number().positive().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const rateCheck = await checkRateLimit("distributor", String(ctx.user?.id ?? "anon"), 10, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });
      const permCheck = await checkPermission(String(ctx.user?.id ?? "anon"), "distributor", "admin");
      if (!permCheck) throw new TRPCError({ code: "FORBIDDEN", message: "Admin permission required" });

      const db = await requireDb();

      // Expire current config
      if (input.partnershipId) {
        await db.update(distributorFeeConfig).set({
          effectiveTo: new Date(),
        }).where(and(
          eq(distributorFeeConfig.partnershipId, input.partnershipId),
          sql`${distributorFeeConfig.effectiveTo} IS NULL`,
        ));
      }

      const [config] = await db.insert(distributorFeeConfig).values({
        partnershipId: input.partnershipId || null,
        platformFeePercent: String(input.platformFeePercent),
        minFeeAmount: input.minFeeAmount ? String(input.minFeeAmount) : null,
        maxFeeAmount: input.maxFeeAmount ? String(input.maxFeeAmount) : null,
        createdBy: ctx.user.id,
      }).returning();

      return config;
    }),

  // ==========================================================================
  // POSTGIS SPATIAL QUERIES
  // ==========================================================================

  /**
   * Find distributors near a location using PostGIS ST_DWithin (geography-aware)
   */
  findNearby: protectedProcedure
    .input(z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      radiusKm: z.number().min(1).max(500).default(50),
      statusFilter: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const rateCheck = await checkRateLimit("distributor-spatial", String(ctx.user.id), 30, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });

      const results = await db.execute(sql`
        SELECT
          d.id, d.business_name, d.warehouse_address,
          d.phone_number, d.contact_person, d.status,
          d.warehouse_capacity_kg, d.total_sales_count,
          d.average_rating, d.coverage_regions,
          ST_X(d.location) AS lng, ST_Y(d.location) AS lat,
          ST_Distance(
            d.location::geography,
            ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)::geography
          ) / 1000 AS distance_km
        FROM distributors d
        WHERE d.location IS NOT NULL
          AND ST_DWithin(
            d.location::geography,
            ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)::geography,
            ${input.radiusKm * 1000}
          )
          ${input.statusFilter ? sql`AND d.status = ${input.statusFilter}` : sql``}
        ORDER BY distance_km ASC
      `);

      return {
        type: "FeatureCollection" as const,
        features: (results.rows as any[]).map(row => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [row.lng, row.lat] },
          properties: {
            id: row.id,
            businessName: row.business_name,
            warehouseAddress: row.warehouse_address,
            contactPerson: row.contact_person,
            phoneNumber: row.phone_number,
            status: row.status,
            capacityKg: row.warehouse_capacity_kg ? Number(row.warehouse_capacity_kg) : null,
            totalSales: row.total_sales_count,
            rating: row.average_rating ? Number(row.average_rating) : null,
            coverageRegions: row.coverage_regions,
            distanceKm: Math.round(Number(row.distance_km) * 100) / 100,
          },
        })),
      };
    }),

  /**
   * Get all distributors as GeoJSON with coverage polygons for MapLibre GL rendering
   */
  getGeoJSON: protectedProcedure
    .input(z.object({
      statusFilter: z.string().optional(),
      includeCoverage: z.boolean().default(true),
    }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const rateCheck = await checkRateLimit("distributor-geojson", String(ctx.user.id), 20, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });

      const results = await db.execute(sql`
        SELECT
          d.id, d.business_name, d.warehouse_address,
          d.phone_number, d.contact_person, d.status,
          d.warehouse_capacity_kg, d.total_sales_count,
          d.average_rating, d.coverage_regions,
          ST_X(d.location) AS lng, ST_Y(d.location) AS lat,
          ${input.includeCoverage ? sql`ST_AsGeoJSON(d.coverage_area)::json AS coverage_geojson` : sql`NULL AS coverage_geojson`}
        FROM distributors d
        WHERE d.location IS NOT NULL
          ${input.statusFilter ? sql`AND d.status = ${input.statusFilter}` : sql``}
        ORDER BY d.business_name
      `);

      const features: any[] = [];
      for (const row of results.rows as any[]) {
        // Warehouse point marker
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [row.lng, row.lat] },
          properties: {
            id: row.id,
            businessName: row.business_name,
            warehouseAddress: row.warehouse_address,
            status: row.status,
            capacityKg: row.warehouse_capacity_kg ? Number(row.warehouse_capacity_kg) : null,
            totalSales: row.total_sales_count,
            rating: row.average_rating ? Number(row.average_rating) : null,
            coverageRegions: row.coverage_regions,
            featureType: "warehouse",
          },
        });

        // Coverage polygon
        if (row.coverage_geojson) {
          features.push({
            type: "Feature",
            geometry: row.coverage_geojson,
            properties: {
              id: row.id,
              businessName: row.business_name,
              status: row.status,
              featureType: "coverage",
            },
          });
        }
      }

      return { type: "FeatureCollection" as const, features };
    }),

  /**
   * PostGIS spatial heatmap data for distributor density/capacity/sales
   */
  getHeatmap: protectedProcedure
    .input(z.object({
      gridSizeDegrees: z.number().min(0.01).max(5).default(0.25),
      metric: z.enum(["count", "capacity", "sales"]).default("count"),
    }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const rateCheck = await checkRateLimit("distributor-heatmap", String(ctx.user.id), 10, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });

      const metricExpr = input.metric === "capacity"
        ? sql`COALESCE(SUM(CAST(warehouse_capacity_kg AS NUMERIC)), 0)`
        : input.metric === "sales"
        ? sql`COALESCE(SUM(total_sales_count), 0)`
        : sql`COUNT(*)`;

      const results = await db.execute(sql`
        SELECT
          ST_X(ST_SnapToGrid(location, ${input.gridSizeDegrees})) AS grid_lng,
          ST_Y(ST_SnapToGrid(location, ${input.gridSizeDegrees})) AS grid_lat,
          ${metricExpr} AS value,
          COUNT(*) AS count
        FROM distributors
        WHERE location IS NOT NULL AND status = 'approved'
        GROUP BY ST_SnapToGrid(location, ${input.gridSizeDegrees})
        ORDER BY value DESC
      `);

      const rows = results.rows as any[];
      const maxValue = rows.length > 0 ? Math.max(...rows.map(r => Number(r.value))) : 1;

      return {
        type: "FeatureCollection" as const,
        features: rows.map(row => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [row.grid_lng, row.grid_lat] },
          properties: {
            value: Number(row.value),
            count: Number(row.count),
            intensity: Number(row.value) / maxValue,
            metric: input.metric,
          },
        })),
        metadata: {
          metric: input.metric,
          gridSizeDegrees: input.gridSizeDegrees,
          totalCells: rows.length,
          maxValue,
        },
      };
    }),

  /**
   * Spatial cluster analysis using PostGIS ST_ClusterDBSCAN
   */
  getClusters: protectedProcedure
    .input(z.object({
      minClusterSize: z.number().min(2).default(3),
      maxDistanceKm: z.number().min(1).default(30),
    }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const rateCheck = await checkRateLimit("distributor-clusters", String(ctx.user.id), 10, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });

      // Convert km to approximate degrees for DBSCAN epsilon
      const epsDegrees = input.maxDistanceKm / 111.0;

      const results = await db.execute(sql`
        SELECT
          id, business_name, status,
          ST_X(location) AS lng, ST_Y(location) AS lat,
          warehouse_capacity_kg, total_sales_count,
          ST_ClusterDBSCAN(location, eps := ${epsDegrees}, minpoints := ${input.minClusterSize})
            OVER() AS cluster_id
        FROM distributors
        WHERE location IS NOT NULL AND status = 'approved'
      `);

      const clusters: Record<number, { id: number; members: any[]; centroid: any; totalCapacityKg: number; totalSales: number }> = {};
      const noise: any[] = [];

      for (const row of results.rows as any[]) {
        const item = {
          id: row.id,
          businessName: row.business_name,
          lng: Number(row.lng),
          lat: Number(row.lat),
          capacityKg: row.warehouse_capacity_kg ? Number(row.warehouse_capacity_kg) : null,
          totalSales: row.total_sales_count || 0,
        };

        if (row.cluster_id === null) {
          noise.push(item);
        } else {
          if (!clusters[row.cluster_id]) {
            clusters[row.cluster_id] = { id: row.cluster_id, members: [], centroid: null, totalCapacityKg: 0, totalSales: 0 };
          }
          clusters[row.cluster_id].members.push(item);
        }
      }

      // Compute centroids
      for (const cluster of Object.values(clusters)) {
        const members = cluster.members;
        cluster.centroid = {
          lat: members.reduce((s, m) => s + m.lat, 0) / members.length,
          lng: members.reduce((s, m) => s + m.lng, 0) / members.length,
        };
        cluster.totalCapacityKg = members.reduce((s, m) => s + (m.capacityKg || 0), 0);
        cluster.totalSales = members.reduce((s, m) => s + m.totalSales, 0);
      }

      return {
        clusters: Object.values(clusters),
        noise,
        statistics: {
          totalDistributors: (results.rows as any[]).length,
          clusteredCount: Object.values(clusters).reduce((s, c) => s + c.members.length, 0),
          noiseCount: noise.length,
          clusterCount: Object.keys(clusters).length,
        },
      };
    }),

  /**
   * Coverage analysis — overlap detection and gap identification
   */
  getCoverageAnalysis: protectedProcedure
    .input(z.object({
      includeGaps: z.boolean().default(true),
    }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const rateCheck = await checkRateLimit("distributor-coverage", String(ctx.user.id), 5, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });

      // Coverage statistics
      const statsResult = await db.execute(sql`
        SELECT
          COUNT(*) AS total_distributors,
          COUNT(CASE WHEN location IS NOT NULL THEN 1 END) AS with_location,
          COUNT(CASE WHEN coverage_area IS NOT NULL THEN 1 END) AS with_coverage,
          COALESCE(SUM(ST_Area(ST_Transform(coverage_area, 3857)) / 1000000), 0) AS total_coverage_km2,
          COALESCE(ST_Area(ST_Transform(ST_Union(coverage_area), 3857)) / 1000000, 0) AS unique_coverage_km2
        FROM distributors
        WHERE status = 'approved'
      `);

      const stats = (statsResult.rows as any[])[0];

      const result: any = {
        statistics: {
          totalDistributors: Number(stats.total_distributors),
          withLocation: Number(stats.with_location),
          withCoverage: Number(stats.with_coverage),
          totalCoverageKm2: Math.round(Number(stats.total_coverage_km2) * 100) / 100,
          uniqueCoverageKm2: Math.round(Number(stats.unique_coverage_km2) * 100) / 100,
          overlapKm2: Math.round((Number(stats.total_coverage_km2) - Number(stats.unique_coverage_km2)) * 100) / 100,
        },
      };

      // Gap analysis
      if (input.includeGaps) {
        const gapResult = await db.execute(sql`
          SELECT
            ST_AsGeoJSON(
              ST_Difference(
                ST_Envelope(ST_Union(coverage_area)),
                ST_Union(coverage_area)
              )
            )::json AS gap_geojson,
            ST_Area(ST_Transform(
              ST_Difference(ST_Envelope(ST_Union(coverage_area)), ST_Union(coverage_area)),
              3857
            )) / 1000000 AS gap_area_km2
          FROM distributors
          WHERE coverage_area IS NOT NULL AND status = 'approved'
        `);

        const gapRow = (gapResult.rows as any[])[0];
        if (gapRow?.gap_geojson) {
          result.gaps = {
            geometry: gapRow.gap_geojson,
            areaKm2: Math.round(Number(gapRow.gap_area_km2) * 100) / 100,
          };
        }
      }

      return result;
    }),

  /**
   * Find optimal distributor for a farm — PostGIS distance + rating scoring
   */
  findOptimalMatch: protectedProcedure
    .input(z.object({
      farmLat: z.number().min(-90).max(90),
      farmLng: z.number().min(-180).max(180),
      commodity: z.string().optional(),
      quantityKg: z.number().min(0).default(0),
    }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const rateCheck = await checkRateLimit("distributor-match", String(ctx.user.id), 20, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });

      const results = await db.execute(sql`
        SELECT
          d.id AS distributor_id,
          d.business_name,
          ST_Distance(
            ST_Transform(d.location, 3857),
            ST_Transform(ST_SetSRID(ST_MakePoint(${input.farmLng}, ${input.farmLat}), 4326), 3857)
          ) / 1000 AS distance_km,
          CAST(d.warehouse_capacity_kg AS NUMERIC) AS available_capacity_kg,
          d.average_rating,
          (1.0 / GREATEST(
            ST_Distance(
              ST_Transform(d.location, 3857),
              ST_Transform(ST_SetSRID(ST_MakePoint(${input.farmLng}, ${input.farmLat}), 4326), 3857)
            ) / 1000, 0.1
          )) * COALESCE(CAST(d.average_rating AS DOUBLE PRECISION), 3.0) AS score
        FROM distributors d
        WHERE d.location IS NOT NULL
          AND d.status = 'approved'
          ${input.quantityKg > 0 ? sql`AND CAST(d.warehouse_capacity_kg AS NUMERIC) >= ${input.quantityKg}` : sql``}
        ORDER BY score DESC
        LIMIT 10
      `);

      return {
        recommendations: (results.rows as any[]).map(row => ({
          distributorId: row.distributor_id,
          businessName: row.business_name,
          distanceKm: Math.round(Number(row.distance_km) * 100) / 100,
          availableCapacityKg: row.available_capacity_kg ? Number(row.available_capacity_kg) : null,
          rating: row.average_rating ? Number(row.average_rating) : null,
          score: Math.round(Number(row.score) * 10000) / 10000,
        })),
      };
    }),
});
