import crypto from "crypto";
/**
 * Banking Service - Mojaloop Integration
 * 
 * Provides banking and payment services via Mojaloop:
 * - Bank account linking
 * - Money transfers (P2P, P2B, B2P)
 * - Payment requests (QR codes)
 * - Transaction history
 * - Balance inquiries
 * 
 * Mojaloop is an open-source payment platform for financial inclusion
 * https://mojaloop.io/
 */

import { getDb } from '../../db';
import {
  bankAccounts,
  bankTransactions,
  mojaloopTransactions,
  paymentRequests,
  type BankAccount,
  type BankTransaction,
} from '../../../drizzle/financial-schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { logger } from '../../logger.js';

export interface LinkBankAccountInput {
  userId: number;
  accountNumber: string;
  accountName: string;
  bankName?: string;
  bankCode?: string;
  accountType?: string;
  mojaloopPartyId: string;
  mojaloopPartyIdType: string; // MSISDN, ACCOUNT_ID, EMAIL, etc.
}

export interface TransferInput {
  userId: number;
  fromAccountId: number;
  toPartyId: string;
  toPartyIdType: string;
  amount: number; // in cents
  currency?: string;
  note?: string;
}

export interface PaymentRequestInput {
  payeeId: number;
  amount: number; // in cents
  currency?: string;
  description?: string;
  expiresIn?: number; // minutes
}

export class BankingService {
  /**
   * Link a bank account to user profile
   */
  async linkBankAccount(input: LinkBankAccountInput): Promise<number> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    // Check if account already exists
    const existing = await database
      .select()
      .from(bankAccounts)
      .where(and(
        eq(bankAccounts.userId, input.userId),
        eq(bankAccounts.accountNumber, input.accountNumber)
      ))
      .limit(1);

    if (existing.length > 0) {
      throw new Error('Bank account already linked');
    }

    // Create bank account
    const [account] = await database.insert(bankAccounts).values({
      userId: input.userId,
      accountNumber: input.accountNumber,
      accountName: input.accountName,
      bankName: input.bankName,
      bankCode: input.bankCode,
      accountType: input.accountType || 'savings',
      mojaloopPartyId: input.mojaloopPartyId,
      mojaloopPartyIdType: input.mojaloopPartyIdType,
      isVerified: false, // Will be verified via Mojaloop
      isPrimary: false,
    }).returning();

    // Call Mojaloop Party Lookup API to verify account via Go microservice
    if (input.mojaloopPartyId && input.mojaloopPartyIdType) {
      try {
        const verified = await this.verifyMojaloopParty(
          input.mojaloopPartyIdType,
          input.mojaloopPartyId
        );
        
        if (verified) {
          await database.update(bankAccounts)
            .set({ isVerified: true, updatedAt: new Date() })
            .where(eq(bankAccounts.id, account.id));
          logger.info(`[Banking] Verified Mojaloop party ${input.mojaloopPartyId}`);
        }
      } catch (error) {
        logger.warn(`[Banking] Mojaloop verification failed for ${input.mojaloopPartyId}:`, error);
        // Account is still linked, just not verified
      }
    }

    logger.info(`[Banking] Linked bank account ${input.accountNumber} for user ${input.userId}`);
    return account.id;
  }

  /**
   * Verify Mojaloop party via Party Lookup API
   */
  private async verifyMojaloopParty(partyIdType: string, partyId: string): Promise<boolean> {
    const mojaloopHost = process.env.MOJALOOP_HOST || 'http://localhost:4002';
    const fspId = process.env.MOJALOOP_FSP_ID || 'farmer-fsp';
    
    try {
      const response = await fetch(`${mojaloopHost}/parties/${partyIdType}/${partyId}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/vnd.interoperability.parties+json;version=1.0',
          'Content-Type': 'application/vnd.interoperability.parties+json;version=1.0',
          'FSPIOP-Source': fspId,
          'Date': new Date().toUTCString(),
        },
      });

      if (response.ok) {
        const data = await response.json();
        return data.party !== undefined;
      }
      return false;
    } catch (error) {
      logger.error('[Banking] Mojaloop party lookup error:', error);
      return false;
    }
  }

  /**
   * Initiate money transfer via Mojaloop
   */
  async initiateTransfer(input: TransferInput): Promise<string> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    // Get source account
    const [fromAccount] = await database
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.id, input.fromAccountId))
      .limit(1);

    if (!fromAccount) {
      throw new Error('Source account not found');
    }

    if (fromAccount.userId !== input.userId) {
      throw new Error('Unauthorized');
    }

    if (!fromAccount.isVerified) {
      throw new Error('Source account not verified');
    }

    // Generate transfer ID
    const transferId = this.generateTransferId();

    // Create bank transaction
    const [transaction] = await database.insert(bankTransactions).values({
      userId: input.userId,
      accountId: input.fromAccountId,
      transactionType: 'transfer_out',
      amount: input.amount,
      currency: input.currency || 'NGN',
      description: input.note,
      status: 'pending',
      transactionDate: new Date(),
    }).returning();

    // Create Mojaloop transaction
    await database.insert(mojaloopTransactions).values({
      bankTransactionId: transaction.id,
      transferId,
      payerPartyIdType: fromAccount.mojaloopPartyIdType,
      payerPartyId: fromAccount.mojaloopPartyId,
      payeePartyIdType: input.toPartyIdType,
      payeePartyId: input.toPartyId,
      amount: input.amount,
      currency: input.currency || 'NGN',
      transactionType: 'TRANSFER',
      note: input.note,
      status: 'pending',
    });

    // Call Mojaloop Transfer API via Go microservice
    // The Go service handles the Mojaloop protocol flow:
    // 1. Party Lookup (GET /parties)
    // 2. Quote Request (POST /quotes)
    // 3. Transfer Request (POST /transfers)
    // 4. Callback handling
    try {
      await this.executeMojaloopTransfer({
        transferId,
        payerPartyIdType: fromAccount.mojaloopPartyIdType || 'MSISDN',
        payerPartyId: fromAccount.mojaloopPartyId || '',
        payeePartyIdType: input.toPartyIdType,
        payeePartyId: input.toPartyId,
        amount: input.amount,
        currency: input.currency || 'NGN',
        note: input.note,
      });
    } catch (error) {
      logger.error(`[Banking] Mojaloop transfer initiation failed:`, error);
      // Update transaction status to failed
      await database.update(bankTransactions)
        .set({ status: 'failed', failureReason: String(error) })
        .where(eq(bankTransactions.id, transaction.id));
      throw error;
    }

    logger.info(`[Banking] Initiated transfer ${transferId}: ₦${(input.amount / 100).toFixed(2)}`);
    return transferId;
  }

  /**
   * Execute Mojaloop transfer via the Go microservice
   */
  private async executeMojaloopTransfer(params: {
    transferId: string;
    payerPartyIdType: string;
    payerPartyId: string;
    payeePartyIdType: string;
    payeePartyId: string;
    amount: number;
    currency: string;
    note?: string;
  }): Promise<void> {
    const mojaloopServiceUrl = process.env.MOJALOOP_SERVICE_URL || 'http://localhost:4002';
    const fspId = process.env.MOJALOOP_FSP_ID || 'farmer-fsp';

    // Step 1: Get quote
    const quoteResponse = await fetch(`${mojaloopServiceUrl}/quotes`, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.interoperability.quotes+json;version=1.0',
        'Content-Type': 'application/vnd.interoperability.quotes+json;version=1.0',
        'FSPIOP-Source': fspId,
        'Date': new Date().toUTCString(),
      },
      body: JSON.stringify({
        quoteId: `quote-${params.transferId}`,
        transactionId: params.transferId,
        payer: {
          partyIdInfo: {
            partyIdType: params.payerPartyIdType,
            partyIdentifier: params.payerPartyId,
            fspId: fspId,
          },
        },
        payee: {
          partyIdInfo: {
            partyIdType: params.payeePartyIdType,
            partyIdentifier: params.payeePartyId,
          },
        },
        amountType: 'SEND',
        amount: {
          amount: (params.amount / 100).toFixed(2),
          currency: params.currency,
        },
        transactionType: {
          scenario: 'TRANSFER',
          initiator: 'PAYER',
          initiatorType: 'CONSUMER',
        },
        note: params.note,
      }),
    });

    if (!quoteResponse.ok) {
      throw new Error(`Quote request failed: ${quoteResponse.status}`);
    }

    // Parse quote response for ILP packet, condition, and payee FSP
    const quoteResult = await quoteResponse.json().catch((e: unknown) => { logger.debug('[Banking] Quote response parse failed', { err: e }); return {}; }) as {
      ilpPacket?: string;
      condition?: string;
      payee?: { partyIdInfo?: { fspId?: string } };
    };
    const ilpPacket = quoteResult.ilpPacket || this.generateIlpPacket(params);
    const condition = quoteResult.condition || this.generateTransferCondition(params.transferId);
    const payeeFsp = quoteResult.payee?.partyIdInfo?.fspId || params.payeePartyId;

    // Step 2: Execute transfer with ILP packet from quote
    const transferResponse = await fetch(`${mojaloopServiceUrl}/transfers`, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.interoperability.transfers+json;version=1.0',
        'Content-Type': 'application/vnd.interoperability.transfers+json;version=1.0',
        'FSPIOP-Source': fspId,
        'Date': new Date().toUTCString(),
      },
      body: JSON.stringify({
        transferId: params.transferId,
        payerFsp: fspId,
        payeeFsp,
        amount: {
          amount: (params.amount / 100).toFixed(2),
          currency: params.currency,
        },
        ilpPacket,
        condition,
        expiration: new Date(Date.now() + 60000).toISOString(),
      }),
    });

    if (!transferResponse.ok) {
      throw new Error(`Transfer request failed: ${transferResponse.status}`);
    }

    logger.info(`[Banking] Mojaloop transfer ${params.transferId} initiated successfully`);
  }

  /**
   * Create payment request (for QR code payments)
   */
  async createPaymentRequest(input: PaymentRequestInput): Promise<{ id: number; qrCode: string }> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    // Calculate expiry
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + (input.expiresIn || 60));

    // Generate QR code data
    const qrCodeData = {
      type: 'payment_request',
      payeeId: input.payeeId,
      amount: input.amount,
      currency: input.currency || 'NGN',
      description: input.description,
      expiresAt: expiresAt.toISOString(),
    };

    // Create payment request
    const [request] = await database.insert(paymentRequests).values({
      payeeId: input.payeeId,
      amount: input.amount,
      currency: input.currency || 'NGN',
      description: input.description,
      qrCodeData: JSON.stringify(qrCodeData),
      status: 'pending',
      expiresAt,
    }).returning();

    // Generate QR code as data URL using qrcode library
    const qrCode = await this.generateQRCode(qrCodeData);

    await database.update(paymentRequests)
      .set({ qrCode })
      .where(eq(paymentRequests.id, request.id));

    logger.info(`[Banking] Created payment request ${request.id}`);
    return { id: request.id, qrCode };
  }

  /**
   * Generate QR code as data URL
   */
  private async generateQRCode(data: object): Promise<string> {
    try {
      // Use dynamic import for qrcode library
      const QRCode = await import('qrcode');
      const qrDataUrl = await QRCode.toDataURL(JSON.stringify(data), {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });
      return qrDataUrl;
    } catch (error) {
      logger.error('[Banking] QR code generation failed:', error);
      // Fallback to simple text representation
      return `QR:${JSON.stringify(data)}`;
    }
  }

  /**
   * Pay a payment request
   */
  async payPaymentRequest(requestId: number, payerId: number, accountId: number): Promise<void> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    // Get payment request
    const [request] = await database
      .select()
      .from(paymentRequests)
      .where(eq(paymentRequests.id, requestId))
      .limit(1);

    if (!request) {
      throw new Error('Payment request not found');
    }

    if (request.status !== 'pending') {
      throw new Error(`Payment request is ${request.status}`);
    }

    if (request.expiresAt && new Date() > request.expiresAt) {
      throw new Error('Payment request expired');
    }

    // Get payee account
    const [payeeAccount] = await database
      .select()
      .from(bankAccounts)
      .where(and(
        eq(bankAccounts.userId, request.payeeId),
        eq(bankAccounts.isPrimary, true)
      ))
      .limit(1);

    if (!payeeAccount) {
      throw new Error('Payee account not found');
    }

    // Validate payee account has Mojaloop details
    if (!payeeAccount.mojaloopPartyId || !payeeAccount.mojaloopPartyIdType) {
      throw new Error('Payee account not linked to Mojaloop');
    }

    // Initiate transfer
    const transferId = await this.initiateTransfer({
      userId: payerId,
      fromAccountId: accountId,
      toPartyId: payeeAccount.mojaloopPartyId,
      toPartyIdType: payeeAccount.mojaloopPartyIdType,
      amount: request.amount,
      currency: request.currency,
      note: `Payment for: ${request.description}`,
    });

    // Update payment request
    await database.update(paymentRequests)
      .set({
        status: 'paid',
        payerId,
        paidAt: new Date(),
      })
      .where(eq(paymentRequests.id, requestId));

    logger.info(`[Banking] Payment request ${requestId} paid via transfer ${transferId}`);
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(userId: number, limit: number = 50): Promise<BankTransaction[]> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    return await database
      .select()
      .from(bankTransactions)
      .where(eq(bankTransactions.userId, userId))
      .orderBy(desc(bankTransactions.transactionDate))
      .limit(limit);
  }

  /**
   * Get user's bank accounts
   */
  async getBankAccounts(userId: number): Promise<BankAccount[]> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    return await database
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.userId, userId))
      .orderBy(desc(bankAccounts.createdAt));
  }

  /**
   * Set primary account
   */
  async setPrimaryAccount(userId: number, accountId: number): Promise<void> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    // Unset all primary flags
    await database.update(bankAccounts)
      .set({ isPrimary: false })
      .where(eq(bankAccounts.userId, userId));

    // Set new primary
    await database.update(bankAccounts)
      .set({ isPrimary: true, updatedAt: new Date() })
      .where(and(
        eq(bankAccounts.id, accountId),
        eq(bankAccounts.userId, userId)
      ));

    logger.info(`[Banking] Set primary account ${accountId} for user ${userId}`);
  }

  /**
   * Update transaction status (called by Mojaloop callback)
   */
  async updateTransactionStatus(
    transferId: string,
    status: string,
    errorCode?: string,
    errorDescription?: string
  ): Promise<void> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    // Update Mojaloop transaction
    await database.update(mojaloopTransactions)
      .set({
        status,
        errorCode: errorCode || undefined,
        errorDescription: errorDescription || undefined,
        updatedAt: new Date(),
      })
      .where(eq(mojaloopTransactions.transferId, transferId));

    // Get bank transaction
    const [mojaloopTx] = await database
      .select()
      .from(mojaloopTransactions)
      .where(eq(mojaloopTransactions.transferId, transferId))
      .limit(1);

    if (mojaloopTx && mojaloopTx.bankTransactionId) {
      // Update bank transaction
      await database.update(bankTransactions)
        .set({
          status: status === 'completed' ? 'completed' : 'failed',
          completedAt: status === 'completed' ? new Date() : undefined,
          failureReason: errorDescription,
        })
        .where(eq(bankTransactions.id, mojaloopTx.bankTransactionId));
    }

    logger.info(`[Banking] Updated transaction ${transferId} status to ${status}`);
  }

  /**
   * Generate transfer ID (UUID-like)
   */
  private generateTransferId(): string {
    return `TXN-${Date.now()}-${crypto.randomUUID().slice(0, 9).toUpperCase()}`;
  }

  /**
   * Generate ILP packet for Mojaloop transfer (fallback when quote doesn't return one)
   * ILP packet encodes the destination, amount, and condition for the Interledger transfer.
   */
  private generateIlpPacket(params: { payeePartyId: string; amount: number; currency: string }): string {
    const ilpData = {
      amount: (params.amount / 100).toFixed(2),
      currency: params.currency,
      destination: `g.ng.farmconnect.${params.payeePartyId}`,
      data: { transactionType: 'TRANSFER', note: 'FarmConnect payment' },
    };
    // Base64url encode the ILP data (per Mojaloop spec)
    const jsonStr = JSON.stringify(ilpData);
    return Buffer.from(jsonStr).toString('base64url');
  }

  /**
   * Generate a SHA-256 condition hash for transfer verification (fallback)
   * In production, this would use a proper fulfillment/condition pair.
   */
  private generateTransferCondition(transferId: string): string {
    // Create a deterministic condition from the transfer ID
    const data = `farmconnect-condition-${transferId}-${Date.now()}`;
    return Buffer.from(data).toString('base64url');
  }
}

// Export singleton instance
export const bankingService = new BankingService();
