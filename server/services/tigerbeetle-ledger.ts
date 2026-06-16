import crypto from "crypto";
/**
 * TigerBeetle Ledger Service
 * High-performance financial ledger for double-entry accounting
 */

import { createClient, Account, Transfer, CreateAccountError, CreateTransferError } from 'tigerbeetle-node';
import { logger } from '../logger.js';

// Account types for the ag-fintech platform
export enum AccountType {
  // Asset accounts (debit balance)
  CASH = 1,
  LOANS_RECEIVABLE = 2,
  INVENTORY = 3,
  EQUIPMENT = 4,
  
  // Liability accounts (credit balance)
  DEPOSITS = 100,
  LOANS_PAYABLE = 101,
  ACCOUNTS_PAYABLE = 102,
  
  // Equity accounts (credit balance)
  CAPITAL = 200,
  RETAINED_EARNINGS = 201,
  
  // Revenue accounts (credit balance)
  INTEREST_INCOME = 300,
  FEE_INCOME = 301,
  COMMISSION_INCOME = 302,
  
  // Expense accounts (debit balance)
  INTEREST_EXPENSE = 400,
  OPERATING_EXPENSE = 401,
  BAD_DEBT_EXPENSE = 402,
}

// Ledger codes for different entities
export enum LedgerCode {
  PLATFORM = 1,
  FARMER = 2,
  COOPERATIVE = 3,
  LENDER = 4,
  MERCHANT = 5,
  AGENT = 6,
}

interface AccountInfo {
  id: bigint;
  type: AccountType;
  ledger: LedgerCode;
  entityId: string;
  currency: string;
}

interface TransferInfo {
  id: bigint;
  debitAccountId: bigint;
  creditAccountId: bigint;
  amount: bigint;
  ledger: LedgerCode;
  code: number;
  reference: string;
}

interface LegacyTransactionInput {
  type: string;
  amount: number;
  fromAccountId: string;
  toAccountId: string;
  metadata?: Record<string, unknown>;
}

export class TigerBeetleLedger {
  private client: any;
  private connected: boolean = false;

  async connect(clusterAddresses: string[] = ['127.0.0.1:3000']): Promise<void> {
    try {
      this.client = createClient({
        cluster_id: 0n,
        replica_addresses: clusterAddresses,
      });
      this.connected = true;
    } catch (error) {
      logger.error('Failed to connect to TigerBeetle:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.destroy();
      this.connected = false;
    }
  }

  // Generate unique account ID from entity info
  generateAccountId(entityId: string, accountType: AccountType, ledger: LedgerCode): bigint {
    // Create deterministic ID from entity info
    const hash = this.hashString(`${entityId}:${accountType}:${ledger}`);
    return BigInt(hash);
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString();
  }

  // Create account
  async createAccount(info: AccountInfo): Promise<bigint> {
    if (!this.connected) throw new Error('Not connected to TigerBeetle');

    const account: Account = {
      id: info.id,
      debits_pending: 0n,
      debits_posted: 0n,
      credits_pending: 0n,
      credits_posted: 0n,
      user_data_128: 0n,
      user_data_64: 0n,
      user_data_32: 0,
      reserved: 0,
      ledger: info.ledger,
      code: info.type,
      flags: 0,
      timestamp: 0n,
    };

    const errors = await this.client.createAccounts([account]);
    
    if (errors.length > 0) {
      const error = errors[0];
      if (error.result !== CreateAccountError.exists) {
        throw new Error(`Failed to create account: ${CreateAccountError[error.result]}`);
      }
    }

    return info.id;
  }

  // Create farmer accounts (full set)
  async createFarmerAccounts(farmerId: string): Promise<{
    cash: bigint;
    loansPayable: bigint;
    inventory: bigint;
  }> {
    const cash = await this.createAccount({
      id: this.generateAccountId(farmerId, AccountType.CASH, LedgerCode.FARMER),
      type: AccountType.CASH,
      ledger: LedgerCode.FARMER,
      entityId: farmerId,
      currency: 'NGN',
    });

    const loansPayable = await this.createAccount({
      id: this.generateAccountId(farmerId, AccountType.LOANS_PAYABLE, LedgerCode.FARMER),
      type: AccountType.LOANS_PAYABLE,
      ledger: LedgerCode.FARMER,
      entityId: farmerId,
      currency: 'NGN',
    });

    const inventory = await this.createAccount({
      id: this.generateAccountId(farmerId, AccountType.INVENTORY, LedgerCode.FARMER),
      type: AccountType.INVENTORY,
      ledger: LedgerCode.FARMER,
      entityId: farmerId,
      currency: 'NGN',
    });

    return { cash, loansPayable, inventory };
  }

  // Create platform accounts
  async createPlatformAccounts(): Promise<{
    cash: bigint;
    loansReceivable: bigint;
    interestIncome: bigint;
    feeIncome: bigint;
  }> {
    const cash = await this.createAccount({
      id: this.generateAccountId('platform', AccountType.CASH, LedgerCode.PLATFORM),
      type: AccountType.CASH,
      ledger: LedgerCode.PLATFORM,
      entityId: 'platform',
      currency: 'NGN',
    });

    const loansReceivable = await this.createAccount({
      id: this.generateAccountId('platform', AccountType.LOANS_RECEIVABLE, LedgerCode.PLATFORM),
      type: AccountType.LOANS_RECEIVABLE,
      ledger: LedgerCode.PLATFORM,
      entityId: 'platform',
      currency: 'NGN',
    });

    const interestIncome = await this.createAccount({
      id: this.generateAccountId('platform', AccountType.INTEREST_INCOME, LedgerCode.PLATFORM),
      type: AccountType.INTEREST_INCOME,
      ledger: LedgerCode.PLATFORM,
      entityId: 'platform',
      currency: 'NGN',
    });

    const feeIncome = await this.createAccount({
      id: this.generateAccountId('platform', AccountType.FEE_INCOME, LedgerCode.PLATFORM),
      type: AccountType.FEE_INCOME,
      ledger: LedgerCode.PLATFORM,
      entityId: 'platform',
      currency: 'NGN',
    });

    return { cash, loansReceivable, interestIncome, feeIncome };
  }

  // Get account balance
  async getAccountBalance(accountId: bigint): Promise<{
    debitsPosted: bigint;
    creditsPosted: bigint;
    debitsPending: bigint;
    creditsPending: bigint;
    balance: bigint;
  }> {
    if (!this.connected) throw new Error('Not connected to TigerBeetle');

    const accounts = await this.client.lookupAccounts([accountId]);
    
    if (accounts.length === 0) {
      throw new Error('Account not found');
    }

    const account = accounts[0];
    const balance = BigInt(account.debits_posted) - BigInt(account.credits_posted);

    return {
      debitsPosted: BigInt(account.debits_posted),
      creditsPosted: BigInt(account.credits_posted),
      debitsPending: BigInt(account.debits_pending),
      creditsPending: BigInt(account.credits_pending),
      balance,
    };
  }

  private inferLedgerFromAccount(accountId: string): LedgerCode {
    return accountId.includes('platform') ? LedgerCode.PLATFORM : LedgerCode.FARMER;
  }

  private deriveTransferCode(type: string): number {
    const codes: Record<string, number> = {
      insurance_premium: 20,
      insurance_payout: 21,
      input_disbursement: 30,
      input_repayment: 31,
      labor_payment: 40,
    };
    return codes[type] ?? 99;
  }

  async recordTransaction(input: LegacyTransactionInput): Promise<{ transactionId: string }> {
    const ledger = this.inferLedgerFromAccount(input.fromAccountId);
    const transferId = BigInt(Date.now()) * 1000n + BigInt(parseInt(crypto.randomUUID().slice(0, 3), 16) % 1000);

    await this.createTransfer({
      id: transferId,
      debitAccountId: this.generateAccountId(input.toAccountId, AccountType.CASH, ledger),
      creditAccountId: this.generateAccountId(input.fromAccountId, AccountType.CASH, ledger),
      amount: BigInt(Math.max(0, Math.round(input.amount))),
      ledger,
      code: this.deriveTransferCode(input.type),
      reference: JSON.stringify({ type: input.type, ...(input.metadata ?? {}) }),
    });

    return { transactionId: transferId.toString() };
  }

  // Create transfer
  async createTransfer(info: TransferInfo): Promise<void> {
    if (!this.connected) throw new Error('Not connected to TigerBeetle');

    const transfer: Transfer = {
      id: info.id,
      debit_account_id: info.debitAccountId,
      credit_account_id: info.creditAccountId,
      amount: info.amount,
      pending_id: 0n,
      user_data_128: 0n,
      user_data_64: 0n,
      user_data_32: 0,
      timeout: 0,
      ledger: info.ledger,
      code: info.code,
      flags: 0,
      timestamp: 0n,
    };

    const errors = await this.client.createTransfers([transfer]);
    
    if (errors.length > 0) {
      const error = errors[0];
      throw new Error(`Failed to create transfer: ${CreateTransferError[error.result]}`);
    }
  }

  // Record loan disbursement (double-entry)
  async recordLoanDisbursement(
    farmerId: string,
    amount: bigint,
    reference: string
  ): Promise<bigint> {
    const transferId = BigInt(Date.now()) * 1000n + BigInt(parseInt(crypto.randomUUID().slice(0, 3), 16) % 1000);

    // Debit: Platform Loans Receivable (asset increases)
    // Credit: Platform Cash (asset decreases)
    await this.createTransfer({
      id: transferId,
      debitAccountId: this.generateAccountId('platform', AccountType.LOANS_RECEIVABLE, LedgerCode.PLATFORM),
      creditAccountId: this.generateAccountId('platform', AccountType.CASH, LedgerCode.PLATFORM),
      amount,
      ledger: LedgerCode.PLATFORM,
      code: 1, // Loan disbursement
      reference,
    });

    // Debit: Farmer Cash (asset increases)
    // Credit: Farmer Loans Payable (liability increases)
    await this.createTransfer({
      id: transferId + 1n,
      debitAccountId: this.generateAccountId(farmerId, AccountType.CASH, LedgerCode.FARMER),
      creditAccountId: this.generateAccountId(farmerId, AccountType.LOANS_PAYABLE, LedgerCode.FARMER),
      amount,
      ledger: LedgerCode.FARMER,
      code: 1, // Loan received
      reference,
    });

    return transferId;
  }

  // Record loan repayment (double-entry)
  async recordLoanRepayment(
    farmerId: string,
    principalAmount: bigint,
    interestAmount: bigint,
    reference: string
  ): Promise<bigint> {
    const transferId = BigInt(Date.now()) * 1000n + BigInt(parseInt(crypto.randomUUID().slice(0, 3), 16) % 1000);
    const totalAmount = principalAmount + interestAmount;

    // Debit: Platform Cash (asset increases)
    // Credit: Platform Loans Receivable (asset decreases)
    await this.createTransfer({
      id: transferId,
      debitAccountId: this.generateAccountId('platform', AccountType.CASH, LedgerCode.PLATFORM),
      creditAccountId: this.generateAccountId('platform', AccountType.LOANS_RECEIVABLE, LedgerCode.PLATFORM),
      amount: principalAmount,
      ledger: LedgerCode.PLATFORM,
      code: 2, // Loan repayment - principal
      reference,
    });

    // Record interest income
    if (interestAmount > 0n) {
      await this.createTransfer({
        id: transferId + 1n,
        debitAccountId: this.generateAccountId('platform', AccountType.CASH, LedgerCode.PLATFORM),
        creditAccountId: this.generateAccountId('platform', AccountType.INTEREST_INCOME, LedgerCode.PLATFORM),
        amount: interestAmount,
        ledger: LedgerCode.PLATFORM,
        code: 3, // Interest income
        reference,
      });
    }

    // Debit: Farmer Loans Payable (liability decreases)
    // Credit: Farmer Cash (asset decreases)
    await this.createTransfer({
      id: transferId + 2n,
      debitAccountId: this.generateAccountId(farmerId, AccountType.LOANS_PAYABLE, LedgerCode.FARMER),
      creditAccountId: this.generateAccountId(farmerId, AccountType.CASH, LedgerCode.FARMER),
      amount: totalAmount,
      ledger: LedgerCode.FARMER,
      code: 2, // Loan repayment
      reference,
    });

    return transferId;
  }

  // Record marketplace transaction
  async recordMarketplaceTransaction(
    buyerId: string,
    sellerId: string,
    amount: bigint,
    feeAmount: bigint,
    reference: string
  ): Promise<bigint> {
    const transferId = BigInt(Date.now()) * 1000n + BigInt(parseInt(crypto.randomUUID().slice(0, 3), 16) % 1000);
    const sellerAmount = amount - feeAmount;

    // Buyer pays
    await this.createTransfer({
      id: transferId,
      debitAccountId: this.generateAccountId('platform', AccountType.CASH, LedgerCode.PLATFORM),
      creditAccountId: this.generateAccountId(buyerId, AccountType.CASH, LedgerCode.FARMER),
      amount,
      ledger: LedgerCode.PLATFORM,
      code: 10, // Marketplace purchase
      reference,
    });

    // Seller receives (minus fee)
    await this.createTransfer({
      id: transferId + 1n,
      debitAccountId: this.generateAccountId(sellerId, AccountType.CASH, LedgerCode.FARMER),
      creditAccountId: this.generateAccountId('platform', AccountType.CASH, LedgerCode.PLATFORM),
      amount: sellerAmount,
      ledger: LedgerCode.PLATFORM,
      code: 11, // Marketplace sale
      reference,
    });

    // Platform fee
    if (feeAmount > 0n) {
      await this.createTransfer({
        id: transferId + 2n,
        debitAccountId: this.generateAccountId('platform', AccountType.CASH, LedgerCode.PLATFORM),
        creditAccountId: this.generateAccountId('platform', AccountType.FEE_INCOME, LedgerCode.PLATFORM),
        amount: feeAmount,
        ledger: LedgerCode.PLATFORM,
        code: 12, // Platform fee
        reference,
      });
    }

    return transferId;
  }

  // Get farmer financial summary
  async getFarmerFinancialSummary(farmerId: string): Promise<{
    cashBalance: bigint;
    outstandingLoans: bigint;
    inventoryValue: bigint;
  }> {
    const cashAccount = await this.getAccountBalance(
      this.generateAccountId(farmerId, AccountType.CASH, LedgerCode.FARMER)
    );
    
    const loansAccount = await this.getAccountBalance(
      this.generateAccountId(farmerId, AccountType.LOANS_PAYABLE, LedgerCode.FARMER)
    );
    
    const inventoryAccount = await this.getAccountBalance(
      this.generateAccountId(farmerId, AccountType.INVENTORY, LedgerCode.FARMER)
    );

    return {
      cashBalance: cashAccount.balance,
      outstandingLoans: loansAccount.creditsPosted - loansAccount.debitsPosted,
      inventoryValue: inventoryAccount.balance,
    };
  }

  // Get platform financial summary
  async getPlatformFinancialSummary(): Promise<{
    cashBalance: bigint;
    totalLoansOutstanding: bigint;
    totalInterestIncome: bigint;
    totalFeeIncome: bigint;
  }> {
    const cashAccount = await this.getAccountBalance(
      this.generateAccountId('platform', AccountType.CASH, LedgerCode.PLATFORM)
    );
    
    const loansAccount = await this.getAccountBalance(
      this.generateAccountId('platform', AccountType.LOANS_RECEIVABLE, LedgerCode.PLATFORM)
    );
    
    const interestAccount = await this.getAccountBalance(
      this.generateAccountId('platform', AccountType.INTEREST_INCOME, LedgerCode.PLATFORM)
    );
    
    const feeAccount = await this.getAccountBalance(
      this.generateAccountId('platform', AccountType.FEE_INCOME, LedgerCode.PLATFORM)
    );

    return {
      cashBalance: cashAccount.balance,
      totalLoansOutstanding: loansAccount.balance,
      totalInterestIncome: interestAccount.creditsPosted - interestAccount.debitsPosted,
      totalFeeIncome: feeAccount.creditsPosted - feeAccount.debitsPosted,
    };
  }
}

// Factory function
export function createTigerBeetleLedger(): TigerBeetleLedger {
  return new TigerBeetleLedger();
}

export default TigerBeetleLedger;
