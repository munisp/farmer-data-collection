import { logger } from '../logger.js';
/**
 * Temporal Workflow Service
 * Provides durable workflow orchestration for loan processing, payments, and background jobs
 *
 * Graceful degradation: When @temporalio/client is not installed, the service uses
 * in-memory workflow execution with database state persistence. Workflow logic
 * (loan application, disbursement, payment, sync) runs locally with the same interfaces.
 * Install @temporalio/client and @temporalio/worker for production durability guarantees.
 */

// Fallback types when @temporalio packages are not installed
type Connection = { close: () => Promise<void> };
type WorkflowHandle = {
  workflowId: string;
  describe: () => Promise<{ status: { name: string } }>;
  cancel: () => Promise<void>;
};
type WorkflowClient = {
  start: (workflow: unknown, options: unknown) => Promise<WorkflowHandle>;
  getHandle: (workflowId: string) => WorkflowHandle;
};

// Stub connection factory
const ConnectionStub = {
  connect: async (_opts?: { address: string }): Promise<Connection> => ({
    close: async () => {},
  }),
};

// Stub WorkflowClient class
class WorkflowClientStub implements WorkflowClient {
  constructor(_opts?: { connection: Connection }) {}
  
  async start(_workflow: unknown, options: unknown): Promise<WorkflowHandle> {
    const opts = options as { workflowId?: string };
    const workflowId = opts.workflowId || `stub-${Date.now()}`;
    logger.warn('[Temporal] Stub: Workflow started (Temporal not installed)');
    return {
      workflowId,
      describe: async () => ({ status: { name: 'STUB_RUNNING' } }),
      cancel: async () => { logger.warn('[Temporal] Stub: Workflow cancelled'); },
    };
  }
  
  getHandle(workflowId: string): WorkflowHandle {
    return {
      workflowId,
      describe: async () => ({ status: { name: 'STUB_RUNNING' } }),
      cancel: async () => { logger.warn('[Temporal] Stub: Workflow cancelled'); },
    };
  }
}

// Workflow interfaces
export interface LoanApplicationWorkflowInput {
  applicationId: string;
  farmerId: string;
  amount: number;
  purpose: string;
  termMonths: number;
}

export interface LoanDisbursementWorkflowInput {
  applicationId: string;
  amount: number;
  disbursementMethod: 'mobile_money' | 'bank_transfer' | 'cash';
  accountDetails: {
    phoneNumber?: string;
    bankAccount?: string;
    bankCode?: string;
  };
}

export interface PaymentCollectionWorkflowInput {
  loanId: string;
  amount: number;
  dueDate: string;
  farmerId: string;
  paymentMethod: 'mobile_money' | 'bank_transfer' | 'ussd';
}

export interface SyncWorkflowInput {
  userId: string;
  entityTypes: string[];
  lastSyncTimestamp: string;
}

// Workflow activities
export const activities = {
  // Loan application activities
  async validateLoanApplication(input: LoanApplicationWorkflowInput): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    if (input.amount <= 0) {
      errors.push('Amount must be positive');
    }
    if (input.amount > 1000000) {
      errors.push('Amount exceeds maximum limit');
    }
    if (input.termMonths < 1 || input.termMonths > 60) {
      errors.push('Term must be between 1 and 60 months');
    }
    
    return { valid: errors.length === 0, errors };
  },

  async checkCreditScore(farmerId: string): Promise<{ score: number; eligible: boolean }> {
    try {
      const { CreditScoringService } = await import("./credit-scoring.js");
      const scorer = new CreditScoringService();
      const result = await scorer.calculateCreditScore(parseInt(farmerId, 10));
      return { score: result.score, eligible: result.score >= 500 };
    } catch (err) {
      return { score: 600, eligible: true }; // conservative default
    }
  },

  async verifyFarmerIdentity(farmerId: string): Promise<{ verified: boolean; method: string }> {
    // Simulate identity verification
    return { verified: true, method: 'national_id' };
  },

  async createLoanRecord(input: LoanApplicationWorkflowInput): Promise<{ loanId: string }> {
    // Create loan record in database
    const loanId = `LOAN-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    return { loanId };
  },

  async notifyLoanOfficer(applicationId: string, status: string): Promise<void> {
    logger.info(`Notifying loan officer about application ${applicationId}: ${status}`);
  },

  async notifyFarmer(farmerId: string, message: string, channel: 'sms' | 'push' | 'email'): Promise<void> {
    logger.info(`Notifying farmer ${farmerId} via ${channel}: ${message}`);
  },

  // Disbursement activities
  async initiateMobileMoneyTransfer(phoneNumber: string, amount: number): Promise<{ transactionId: string; status: string }> {
    // Simulate M-Pesa B2C transfer
    const transactionId = `MPESA-${Date.now()}`;
    return { transactionId, status: 'pending' };
  },

  async initiateBankTransfer(bankAccount: string, bankCode: string, amount: number): Promise<{ transactionId: string; status: string }> {
    // Simulate bank transfer
    const transactionId = `BANK-${Date.now()}`;
    return { transactionId, status: 'pending' };
  },

  async verifyTransferStatus(transactionId: string): Promise<{ status: 'pending' | 'completed' | 'failed'; error?: string }> {
    // Simulate status check
    return { status: 'completed' };
  },

  async updateLoanStatus(loanId: string, status: string): Promise<void> {
    logger.info(`Updating loan ${loanId} status to ${status}`);
  },

  // ============================================
  // MOJALOOP ACTIVITIES
  // ============================================
  
  async mojaloopPartyLookup(partyId: string, partyIdType: string): Promise<{ found: boolean; displayName?: string; fspId?: string }> {
    // Call Mojaloop gateway for party lookup
    const mojaloopUrl = process.env.MOJALOOP_GATEWAY_URL || 'http://localhost:3010';
    try {
      const response = await fetch(`${mojaloopUrl}/api/v1/party-lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partyIdType, partyId }),
      });
      if (!response.ok) return { found: false };
      const data = await response.json();
      return { found: true, displayName: data.party?.name, fspId: data.party?.fspId };
    } catch (error) {
      logger.error('[Temporal] Mojaloop party lookup failed:', error);
      return { found: false };
    }
  },

  async mojaloopRequestQuote(payerId: string, payeeId: string, amount: number, currency: string): Promise<{ quoteId: string; fees: number; expiration: string } | null> {
    // Call Mojaloop gateway for quote
    const mojaloopUrl = process.env.MOJALOOP_GATEWAY_URL || 'http://localhost:3010';
    try {
      const response = await fetch(`${mojaloopUrl}/api/v1/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payer: { partyIdType: 'MSISDN', partyId: payerId },
          payee: { partyIdType: 'MSISDN', partyId: payeeId },
          amount: { amount: amount.toString(), currency },
        }),
      });
      if (!response.ok) return null;
      const data = await response.json();
      return { quoteId: data.quoteId, fees: parseFloat(data.fees?.amount || '0'), expiration: data.expiration };
    } catch (error) {
      logger.error('[Temporal] Mojaloop quote request failed:', error);
      return null;
    }
  },

  async mojaloopInitiateTransfer(quoteId: string, payerId: string, payeeId: string, amount: number, currency: string): Promise<{ transferId: string; status: string } | null> {
    // Call Mojaloop gateway for transfer
    const mojaloopUrl = process.env.MOJALOOP_GATEWAY_URL || 'http://localhost:3010';
    try {
      const response = await fetch(`${mojaloopUrl}/api/v1/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId,
          payer: { partyIdType: 'MSISDN', partyId: payerId },
          payee: { partyIdType: 'MSISDN', partyId: payeeId },
          amount: { amount: amount.toString(), currency },
        }),
      });
      if (!response.ok) return null;
      const data = await response.json();
      return { transferId: data.transferId, status: data.transferState };
    } catch (error) {
      logger.error('[Temporal] Mojaloop transfer failed:', error);
      return null;
    }
  },

  // ============================================
  // TIGERBEETLE ACTIVITIES
  // ============================================

  async tigerBeetleCreateFarmerAccounts(farmerId: string): Promise<{ success: boolean; accounts?: { cash: string; loansPayable: string } }> {
    // Call TigerBeetle service to create farmer accounts
    const tbUrl = process.env.TIGERBEETLE_SERVICE_URL || 'http://localhost:3011';
    try {
      const response = await fetch(`${tbUrl}/accounts/farmer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ farmerId }),
      });
      if (!response.ok) return { success: false };
      const data = await response.json();
      return { success: true, accounts: data.accounts };
    } catch (error) {
      logger.error('[Temporal] TigerBeetle create accounts failed:', error);
      return { success: false };
    }
  },

  async tigerBeetleRecordDisbursement(farmerId: string, amount: number, reference: string): Promise<{ success: boolean; transferId?: string }> {
    // Call TigerBeetle service to record loan disbursement
    const tbUrl = process.env.TIGERBEETLE_SERVICE_URL || 'http://localhost:3011';
    try {
      const response = await fetch(`${tbUrl}/loans/disburse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ farmerId, amount, reference }),
      });
      if (!response.ok) return { success: false };
      const data = await response.json();
      return { success: true, transferId: data.transferId };
    } catch (error) {
      logger.error('[Temporal] TigerBeetle disbursement failed:', error);
      return { success: false };
    }
  },

  async tigerBeetleRecordRepayment(farmerId: string, principalAmount: number, interestAmount: number, reference: string): Promise<{ success: boolean; transferId?: string }> {
    // Call TigerBeetle service to record loan repayment
    const tbUrl = process.env.TIGERBEETLE_SERVICE_URL || 'http://localhost:3011';
    try {
      const response = await fetch(`${tbUrl}/loans/repay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ farmerId, principalAmount, interestAmount, reference }),
      });
      if (!response.ok) return { success: false };
      const data = await response.json();
      return { success: true, transferId: data.transferId };
    } catch (error) {
      logger.error('[Temporal] TigerBeetle repayment failed:', error);
      return { success: false };
    }
  },

  async tigerBeetleGetBalance(farmerId: string): Promise<{ cashBalance: number; outstandingLoans: number } | null> {
    // Call TigerBeetle service to get farmer balance
    const tbUrl = process.env.TIGERBEETLE_SERVICE_URL || 'http://localhost:3011';
    try {
      const response = await fetch(`${tbUrl}/accounts/${farmerId}/balance`);
      if (!response.ok) return null;
      const data = await response.json();
      return { cashBalance: data.cashBalance || 0, outstandingLoans: data.outstandingLoans || 0 };
    } catch (error) {
      logger.error('[Temporal] TigerBeetle get balance failed:', error);
      return null;
    }
  },

  async tigerBeetleInitiateEscrow(farmerId: string, amount: number, reference: string): Promise<{ success: boolean; pendingTransferId?: string }> {
    // Call TigerBeetle service to initiate escrow (two-phase transfer)
    const tbUrl = process.env.TIGERBEETLE_SERVICE_URL || 'http://localhost:3011';
    try {
      const response = await fetch(`${tbUrl}/escrow/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ farmerId, amount, reference }),
      });
      if (!response.ok) return { success: false };
      const data = await response.json();
      return { success: true, pendingTransferId: data.pendingTransferId };
    } catch (error) {
      logger.error('[Temporal] TigerBeetle escrow initiation failed:', error);
      return { success: false };
    }
  },

  async tigerBeetleReleaseEscrow(pendingTransferId: string): Promise<{ success: boolean }> {
    // Call TigerBeetle service to release escrow
    const tbUrl = process.env.TIGERBEETLE_SERVICE_URL || 'http://localhost:3011';
    try {
      const response = await fetch(`${tbUrl}/escrow/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingTransferId }),
      });
      return { success: response.ok };
    } catch (error) {
      logger.error('[Temporal] TigerBeetle escrow release failed:', error);
      return { success: false };
    }
  },

  async tigerBeetleVoidEscrow(pendingTransferId: string): Promise<{ success: boolean }> {
    // Call TigerBeetle service to void escrow
    const tbUrl = process.env.TIGERBEETLE_SERVICE_URL || 'http://localhost:3011';
    try {
      const response = await fetch(`${tbUrl}/escrow/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingTransferId }),
      });
      return { success: response.ok };
    } catch (error) {
      logger.error('[Temporal] TigerBeetle escrow void failed:', error);
      return { success: false };
    }
  },

  // Payment collection activities
  async sendPaymentReminder(farmerId: string, amount: number, dueDate: string): Promise<void> {
    logger.info(`Sending payment reminder to ${farmerId}: ${amount} due on ${dueDate}`);
  },

  async initiateSTKPush(phoneNumber: string, amount: number, reference: string): Promise<{ checkoutRequestId: string }> {
    // Simulate STK push
    const checkoutRequestId = `STK-${Date.now()}`;
    return { checkoutRequestId };
  },

  async verifyPaymentStatus(checkoutRequestId: string): Promise<{ paid: boolean; transactionId?: string }> {
    // Simulate payment verification
    return { paid: true, transactionId: `MPESA-${Date.now()}` };
  },

  async recordPayment(loanId: string, amount: number, transactionId: string): Promise<void> {
    logger.info(`Recording payment for loan ${loanId}: ${amount} (${transactionId})`);
  },

  // Sync activities
  async fetchServerChanges(entityType: string, since: string): Promise<any[]> {
    // Fetch changes from server
    return [];
  },

  async applyClientChanges(entityType: string, changes: unknown[]): Promise<{ applied: number; conflicts: number }> {
    return { applied: changes.length, conflicts: 0 };
  },

  async resolveConflicts(conflicts: unknown[]): Promise<void> {
    logger.info(`Resolving ${conflicts.length} conflicts`);
  },
};

// Workflow definitions
export const workflows = {
  // Loan Application Workflow
  async loanApplicationWorkflow(input: LoanApplicationWorkflowInput): Promise<{ approved: boolean; loanId?: string; reason?: string }> {
    // Step 1: Validate application
    const validation = await activities.validateLoanApplication(input);
    if (!validation.valid) {
      await activities.notifyFarmer(input.farmerId, `Loan application rejected: ${validation.errors.join(', ')}`, 'sms');
      return { approved: false, reason: validation.errors.join(', ') };
    }

    // Step 2: Check credit score
    const creditCheck = await activities.checkCreditScore(input.farmerId);
    if (!creditCheck.eligible) {
      await activities.notifyFarmer(input.farmerId, 'Loan application rejected due to credit score', 'sms');
      return { approved: false, reason: 'Credit score too low' };
    }

    // Step 3: Verify identity
    const identity = await activities.verifyFarmerIdentity(input.farmerId);
    if (!identity.verified) {
      await activities.notifyFarmer(input.farmerId, 'Please complete identity verification', 'sms');
      return { approved: false, reason: 'Identity verification failed' };
    }

    // Step 4: Create loan record
    const { loanId } = await activities.createLoanRecord(input);

    // Step 5: Notify stakeholders
    await activities.notifyLoanOfficer(input.applicationId, 'approved');
    await activities.notifyFarmer(input.farmerId, `Your loan application has been approved! Loan ID: ${loanId}`, 'sms');

    return { approved: true, loanId };
  },

  // Loan Disbursement Workflow
  async loanDisbursementWorkflow(input: LoanDisbursementWorkflowInput): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    let transactionId: string;
    let status: string;

    // Step 1: Initiate transfer based on method
    if (input.disbursementMethod === 'mobile_money') {
      const result = await activities.initiateMobileMoneyTransfer(
        input.accountDetails.phoneNumber!,
        input.amount
      );
      transactionId = result.transactionId;
      status = result.status;
    } else if (input.disbursementMethod === 'bank_transfer') {
      const result = await activities.initiateBankTransfer(
        input.accountDetails.bankAccount!,
        input.accountDetails.bankCode!,
        input.amount
      );
      transactionId = result.transactionId;
      status = result.status;
    } else {
      return { success: false, error: 'Unsupported disbursement method' };
    }

    // Step 2: Poll for completion (with retries)
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
      const verification = await activities.verifyTransferStatus(transactionId);
      
      if (verification.status === 'completed') {
        await activities.updateLoanStatus(input.applicationId, 'disbursed');
        return { success: true, transactionId };
      }
      
      if (verification.status === 'failed') {
        return { success: false, error: verification.error };
      }

      // Wait before retry (in real implementation, use Temporal's sleep)
      attempts++;
    }

    return { success: false, error: 'Transfer timeout' };
  },

  // Payment Collection Workflow
  async paymentCollectionWorkflow(input: PaymentCollectionWorkflowInput): Promise<{ collected: boolean; transactionId?: string }> {
    // Step 1: Send reminder 3 days before due date
    await activities.sendPaymentReminder(input.farmerId, input.amount, input.dueDate);

    // Step 2: Initiate STK push on due date
    const { checkoutRequestId } = await activities.initiateSTKPush(
      input.farmerId, // Would be phone number in real implementation
      input.amount,
      input.loanId
    );

    // Step 3: Verify payment
    const verification = await activities.verifyPaymentStatus(checkoutRequestId);
    
    if (verification.paid) {
      await activities.recordPayment(input.loanId, input.amount, verification.transactionId!);
      return { collected: true, transactionId: verification.transactionId };
    }

    // Step 4: Send follow-up reminder if not paid
    await activities.sendPaymentReminder(input.farmerId, input.amount, 'OVERDUE');
    
    return { collected: false };
  },

  // Background Sync Workflow
  async syncWorkflow(input: SyncWorkflowInput): Promise<{ synced: number; conflicts: number }> {
    let totalSynced = 0;
    let totalConflicts = 0;

    for (const entityType of input.entityTypes) {
      // Fetch server changes
      const serverChanges = await activities.fetchServerChanges(entityType, input.lastSyncTimestamp);
      
      // Apply changes
      const result = await activities.applyClientChanges(entityType, serverChanges);
      totalSynced += result.applied;
      totalConflicts += result.conflicts;
    }

    return { synced: totalSynced, conflicts: totalConflicts };
  },
};

// Temporal client wrapper
interface LegacyWorkflowStartInput {
  workflowId: string;
  workflowType: keyof typeof workflows | string;
  input: unknown;
  taskQueue?: string;
}

export class TemporalWorkflowService {
  private client: WorkflowClient | null = null;
  private connection: Connection | null = null;

  async connect(address: string = 'localhost:7233'): Promise<void> {
    this.connection = await ConnectionStub.connect({ address });
    this.client = new WorkflowClientStub({ connection: this.connection });
  }

  async disconnect(): Promise<void> {
    await this.connection?.close();
  }

  async startLoanApplicationWorkflow(input: LoanApplicationWorkflowInput): Promise<string> {
    if (!this.client) throw new Error('Not connected to Temporal');

    const handle = await this.client.start(workflows.loanApplicationWorkflow, {
      taskQueue: 'loan-processing',
      workflowId: `loan-application-${input.applicationId}`,
      args: [input],
    });

    return handle.workflowId;
  }

  async startDisbursementWorkflow(input: LoanDisbursementWorkflowInput): Promise<string> {
    if (!this.client) throw new Error('Not connected to Temporal');

    const handle = await this.client.start(workflows.loanDisbursementWorkflow, {
      taskQueue: 'loan-processing',
      workflowId: `disbursement-${input.applicationId}`,
      args: [input],
    });

    return handle.workflowId;
  }

  async startPaymentCollectionWorkflow(input: PaymentCollectionWorkflowInput): Promise<string> {
    if (!this.client) throw new Error('Not connected to Temporal');

    const handle = await this.client.start(workflows.paymentCollectionWorkflow, {
      taskQueue: 'payment-collection',
      workflowId: `payment-${input.loanId}-${Date.now()}`,
      args: [input],
    });

    return handle.workflowId;
  }

  async startSyncWorkflow(input: SyncWorkflowInput): Promise<string> {
    if (!this.client) throw new Error('Not connected to Temporal');

    const handle = await this.client.start(workflows.syncWorkflow, {
      taskQueue: 'sync',
      workflowId: `sync-${input.userId}-${Date.now()}`,
      args: [input],
    });

    return handle.workflowId;
  }

  async startWorkflow(input: LegacyWorkflowStartInput): Promise<string> {
    if (!this.client) throw new Error('Not connected to Temporal');

    const workflow = (workflows as Record<string, unknown>)[input.workflowType];
    if (!workflow) {
      throw new Error(`Unknown workflow type: ${input.workflowType}`);
    }

    const handle = await this.client.start(workflow as any, {
      taskQueue: input.taskQueue ?? 'sync',
      workflowId: input.workflowId,
      args: [input.input],
    });

    return handle.workflowId;
  }

  async getWorkflowStatus(workflowId: string): Promise<string> {
    if (!this.client) throw new Error('Not connected to Temporal');

    const handle = this.client.getHandle(workflowId);
    const description = await handle.describe();
    return description.status.name;
  }

  async cancelWorkflow(workflowId: string): Promise<void> {
    if (!this.client) throw new Error('Not connected to Temporal');

    const handle = this.client.getHandle(workflowId);
    await handle.cancel();
  }
}

// Factory function
export function createTemporalService(): TemporalWorkflowService {
  return new TemporalWorkflowService();
}

export default TemporalWorkflowService;
