import crypto from "crypto";
import { getDb } from "../db.js";
import {
  loanDisbursements,
  disbursementStatusHistory,
  type NewLoanDisbursement,
} from "../../drizzle/disbursement-schema.js";
import { loans } from "../../drizzle/financial-schema.js";
import { eq, and, desc } from "drizzle-orm";
import { createTigerBeetleLedger, TigerBeetleLedger } from "./tigerbeetle-ledger.js";
import { logger } from '../logger.js';

// TigerBeetle ledger instance (lazy initialization)
let ledgerInstance: TigerBeetleLedger | null = null;

async function getLedger(): Promise<TigerBeetleLedger> {
  if (ledgerInstance) return ledgerInstance;
  
  // TigerBeetle is REQUIRED for all monetary flows - no fallback
  const ledger = createTigerBeetleLedger();
  const addresses = process.env.TIGERBEETLE_ADDRESSES?.split(',') || ['127.0.0.1:3000'];
  await ledger.connect(addresses);
  ledgerInstance = ledger;
  logger.info('[Disbursement] TigerBeetle ledger connected - REQUIRED for all monetary flows');
  return ledger;
}

/**
 * Disbursement Service
 * 
 * Manages loan disbursement lifecycle:
 * - Creating disbursement records
 * - Processing disbursements
 * - Tracking status changes
 * - Integration with payment providers
 */

export type DisbursementMethod =
  | "bank_transfer"
  | "mobile_money"
  | "cash"
  | "check";

export type DisbursementStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface CreateDisbursementInput {
  loanId: number;
  userId: number;
  amount: number;
  method: DisbursementMethod;
  
  // Bank transfer details
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  
  // Mobile money details
  mobileMoneyProvider?: string;
  mobileMoneyNumber?: string;
  
  scheduledAt?: Date;
  notes?: string;
}

export interface ProcessDisbursementInput {
  disbursementId: number;
  transactionReference: string;
  processedBy: number;
  notes?: string;
}

export class DisbursementService {
  /**
   * Generate unique disbursement number
   */
  private generateDisbursementNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomUUID().slice(0, 6).toUpperCase();
    return `DISB-${timestamp}-${random}`;
  }

  /**
   * Create a new disbursement record
   */
  async createDisbursement(input: CreateDisbursementInput) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Verify loan exists and is approved
    const [loan] = await db
      .select()
      .from(loans)
      .where(and(eq(loans.id, input.loanId), eq(loans.userId, input.userId)))
      .limit(1);

    if (!loan) {
      throw new Error("Loan not found");
    }

    if (loan.status !== "active") {
      throw new Error("Loan must be active to create disbursement");
    }

    // Create disbursement record
    const disbursementNumber = this.generateDisbursementNumber();

    const newDisbursement: NewLoanDisbursement = {
      loanId: input.loanId,
      userId: input.userId,
      disbursementNumber,
      amount: input.amount,
      method: input.method,
      bankName: input.bankName,
      accountNumber: input.accountNumber,
      accountName: input.accountName,
      mobileMoneyProvider: input.mobileMoneyProvider,
      mobileMoneyNumber: input.mobileMoneyNumber,
      status: "pending",
      scheduledAt: input.scheduledAt,
      notes: input.notes,
    };

    const [disbursement] = await db
      .insert(loanDisbursements)
      .values(newDisbursement)
      .returning();

    // Record status history
    await this.recordStatusChange(disbursement.id, null, "pending", null, "Disbursement created");

    return disbursement;
  }

  /**
   * Process a pending disbursement
   */
  async processDisbursement(input: ProcessDisbursementInput) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Get disbursement
    const [disbursement] = await db
      .select()
      .from(loanDisbursements)
      .where(eq(loanDisbursements.id, input.disbursementId))
      .limit(1);

    if (!disbursement) {
      throw new Error("Disbursement not found");
    }

    if (disbursement.status !== "pending") {
      throw new Error(`Cannot process disbursement with status: ${disbursement.status}`);
    }

    // Update to processing status
    const [updated] = await db
      .update(loanDisbursements)
      .set({
        status: "processing",
        processedAt: new Date(),
        processedBy: input.processedBy,
        transactionReference: input.transactionReference,
        updatedAt: new Date(),
      })
      .where(eq(loanDisbursements.id, input.disbursementId))
      .returning();

    // Record status change
    await this.recordStatusChange(
      input.disbursementId,
      "pending",
      "processing",
      input.processedBy,
      input.notes || "Disbursement processing started"
    );

    return updated;
  }

  /**
   * Mark disbursement as completed
   */
  async completeDisbursement(
    disbursementId: number,
    completedBy: number,
    notes?: string
  ) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [disbursement] = await db
      .select()
      .from(loanDisbursements)
      .where(eq(loanDisbursements.id, disbursementId))
      .limit(1);

    if (!disbursement) {
      throw new Error("Disbursement not found");
    }

    if (disbursement.status !== "processing") {
      throw new Error(`Cannot complete disbursement with status: ${disbursement.status}`);
    }

      const [updated] = await db
        .update(loanDisbursements)
        .set({
          status: "completed",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(loanDisbursements.id, disbursementId))
        .returning();

      // Record in TigerBeetle ledger for double-entry accounting - REQUIRED
      const ledger = await getLedger();
      const farmerId = `farmer-${disbursement.userId}`;
      const amount = BigInt(Math.round(disbursement.amount * 100)); // Convert to cents
      const reference = `DISB-${disbursement.disbursementNumber}`;
      
      // Ensure farmer accounts exist
      await ledger.createFarmerAccounts(farmerId);
      
      // Record the loan disbursement in the ledger (uses linked transfers for atomicity)
      await ledger.recordLoanDisbursement(farmerId, amount, reference);
      logger.info(`[Disbursement] Recorded in TigerBeetle ledger: ${reference}`);

      await this.recordStatusChange(
        disbursementId,
        "processing",
        "completed",
        completedBy,
        notes || "Disbursement completed successfully"
      );

      return updated;
    }

    /**
     * Mark disbursement as failed
     */
  async failDisbursement(
    disbursementId: number,
    failedBy: number,
    failureReason: string
  ) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [disbursement] = await db
      .select()
      .from(loanDisbursements)
      .where(eq(loanDisbursements.id, disbursementId))
      .limit(1);

    if (!disbursement) {
      throw new Error("Disbursement not found");
    }

    const [updated] = await db
      .update(loanDisbursements)
      .set({
        status: "failed",
        failedAt: new Date(),
        failureReason,
        updatedAt: new Date(),
      })
      .where(eq(loanDisbursements.id, disbursementId))
      .returning();

    await this.recordStatusChange(
      disbursementId,
      disbursement.status,
      "failed",
      failedBy,
      failureReason
    );

    return updated;
  }

  /**
   * Cancel a pending disbursement
   */
  async cancelDisbursement(
    disbursementId: number,
    cancelledBy: number,
    reason: string
  ) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [disbursement] = await db
      .select()
      .from(loanDisbursements)
      .where(eq(loanDisbursements.id, disbursementId))
      .limit(1);

    if (!disbursement) {
      throw new Error("Disbursement not found");
    }

    if (disbursement.status !== "pending") {
      throw new Error(`Cannot cancel disbursement with status: ${disbursement.status}`);
    }

    const [updated] = await db
      .update(loanDisbursements)
      .set({
        status: "cancelled",
        notes: reason,
        updatedAt: new Date(),
      })
      .where(eq(loanDisbursements.id, disbursementId))
      .returning();

    await this.recordStatusChange(
      disbursementId,
      "pending",
      "cancelled",
      cancelledBy,
      reason
    );

    return updated;
  }

  /**
   * Get disbursement by ID
   */
  async getDisbursement(disbursementId: number) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [disbursement] = await db
      .select()
      .from(loanDisbursements)
      .where(eq(loanDisbursements.id, disbursementId))
      .limit(1);

    return disbursement;
  }

  /**
   * Get all disbursements for a loan
   */
  async getDisbursementsByLoan(loanId: number) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    return db
      .select()
      .from(loanDisbursements)
      .where(eq(loanDisbursements.loanId, loanId))
      .orderBy(desc(loanDisbursements.createdAt));
  }

  /**
   * Get all disbursements for a user
   */
  async getDisbursementsByUser(userId: number) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    return db
      .select()
      .from(loanDisbursements)
      .where(eq(loanDisbursements.userId, userId))
      .orderBy(desc(loanDisbursements.createdAt));
  }

  /**
   * Get disbursements by status
   */
  async getDisbursementsByStatus(status: DisbursementStatus) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    return db
      .select()
      .from(loanDisbursements)
      .where(eq(loanDisbursements.status, status))
      .orderBy(desc(loanDisbursements.createdAt));
  }

  /**
   * Get status history for a disbursement
   */
  async getStatusHistory(disbursementId: number) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    return db
      .select()
      .from(disbursementStatusHistory)
      .where(eq(disbursementStatusHistory.disbursementId, disbursementId))
      .orderBy(desc(disbursementStatusHistory.createdAt));
  }

  /**
   * Record status change in history
   */
  private async recordStatusChange(
    disbursementId: number,
    fromStatus: string | null,
    toStatus: string,
    changedBy: number | null,
    notes?: string
  ) {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.insert(disbursementStatusHistory).values({
      disbursementId,
      fromStatus,
      toStatus,
      changedBy,
      notes,
    });
  }
}

export const disbursementService = new DisbursementService();
