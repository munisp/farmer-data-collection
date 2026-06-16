import { createClient, Account, Transfer, CreateAccountError, CreateTransferError } from 'tigerbeetle-node';
import { logger } from './logger.js';

const TIGERBEETLE_CLUSTER_ID = process.env.TIGERBEETLE_CLUSTER_ID || '0';
const TIGERBEETLE_REPLICA_ADDRESSES = (process.env.TIGERBEETLE_REPLICA_ADDRESSES || '3000').split(',');

let client: ReturnType<typeof createClient> | null = null;
let _connectionFailed = false;
let _lastAttempt = 0;
const RETRY_INTERVAL_MS = 30_000;

export async function getTigerBeetleClient(): Promise<ReturnType<typeof createClient> | null> {
  if (_connectionFailed && Date.now() - _lastAttempt < RETRY_INTERVAL_MS) return null;
  if (client) return client;

  try {
    _lastAttempt = Date.now();
    client = createClient({
      cluster_id: BigInt(TIGERBEETLE_CLUSTER_ID),
      replica_addresses: TIGERBEETLE_REPLICA_ADDRESSES,
    });
    _connectionFailed = false;
    logger.info('[TigerBeetle] Client created', {
      clusterId: TIGERBEETLE_CLUSTER_ID,
      replicas: TIGERBEETLE_REPLICA_ADDRESSES.join(','),
    });
    return client;
  } catch (error) {
    _connectionFailed = true;
    logger.warn('[TigerBeetle] Client creation failed — degraded mode', {
      error: (error as Error).message,
    });
    return null;
  }
}

export function isTigerBeetleHealthy(): boolean {
  return client !== null && !_connectionFailed;
}

export async function closeTigerBeetle(): Promise<void> {
  if (client) {
    try {
      client.destroy();
      client = null;
      logger.info('[TigerBeetle] Client closed');
    } catch (error) {
      logger.warn('[TigerBeetle] Error closing client', { error: (error as Error).message });
    }
  }
}

// Account types (chart of accounts)
export const ACCOUNT_TYPES = {
  // Asset accounts (debits increase, credits decrease)
  CASH: BigInt(1001),
  ACCOUNTS_RECEIVABLE: BigInt(1002),
  INVENTORY: BigInt(1003),
  EQUIPMENT: BigInt(1004),
  
  // Liability accounts (credits increase, debits decrease)
  ACCOUNTS_PAYABLE: BigInt(2001),
  LOANS_PAYABLE: BigInt(2002),
  
  // Equity accounts (credits increase, debits decrease)
  OWNER_EQUITY: BigInt(3001),
  RETAINED_EARNINGS: BigInt(3002),
  
  // Revenue accounts (credits increase, debits decrease)
  HARVEST_REVENUE: BigInt(4001),
  LIVESTOCK_REVENUE: BigInt(4002),
  OTHER_REVENUE: BigInt(4003),
  
  // Expense accounts (debits increase, credits decrease)
  SEED_EXPENSE: BigInt(5001),
  FERTILIZER_EXPENSE: BigInt(5002),
  PESTICIDE_EXPENSE: BigInt(5003),
  LABOR_EXPENSE: BigInt(5004),
  EQUIPMENT_EXPENSE: BigInt(5005),
  UTILITIES_EXPENSE: BigInt(5006),
  OTHER_EXPENSE: BigInt(5007),
} as const;

// Ledger IDs for different farmers/organizations
export function getFarmerLedger(farmerId: number): number {
  return 1000 + farmerId;
}

/**
 * Create a new account in TigerBeetle
 */
export async function createAccount(
  accountId: bigint,
  ledger: number,
  code: bigint,
  flags: number = 0
): Promise<void> {
  try {
    const tbClient = await getTigerBeetleClient();
    if (!tbClient) throw new Error('TigerBeetle unavailable');
    
    const account: Account = {
      id: accountId,
      debits_pending: BigInt(0),
      debits_posted: BigInt(0),
      credits_pending: BigInt(0),
      credits_posted: BigInt(0),
      user_data_128: BigInt(0),
      user_data_64: BigInt(0),
      user_data_32: 0,
      reserved: 0,
      ledger: ledger as any,
      code: code as any,
      flags,
      timestamp: BigInt(0),
    };
    
    const errors = await tbClient.createAccounts([account]);
    
    if (errors.length > 0) {
      const error = errors[0];
      if (error.result !== CreateAccountError.exists) {
        throw new Error(`Failed to create account: ${CreateAccountError[error.result]}`);
      }
      logger.info(`[TigerBeetle] Account ${accountId} already exists`);
    } else {
      logger.info(`[TigerBeetle] Created account: ${accountId}`, { ledger, code: code.toString() });
    }
  } catch (error) {
    logger.error('[TigerBeetle] Failed to create account', { error: (error as Error).message });
    throw error;
  }
}

/**
 * Create a transfer (transaction) between accounts
 */
export async function createTransfer(
  transferId: bigint,
  debitAccountId: bigint,
  creditAccountId: bigint,
  amount: bigint,
  ledger: number,
  code: bigint = BigInt(0),
  flags: number = 0
): Promise<void> {
  try {
    const tbClient = await getTigerBeetleClient();
    if (!tbClient) throw new Error('TigerBeetle unavailable');
    
    const transfer: Transfer = {
      id: transferId,
      debit_account_id: debitAccountId,
      credit_account_id: creditAccountId,
      amount,
      pending_id: BigInt(0),
      user_data_128: BigInt(0),
      user_data_64: BigInt(0),
      user_data_32: 0,
      timeout: 0,
      ledger: ledger as any,
      code: code as any,
      flags,
      timestamp: BigInt(0),
    };
    
    const errors = await tbClient.createTransfers([transfer]);
    
    if (errors.length > 0) {
      const error = errors[0];
      throw new Error(`Failed to create transfer: ${CreateTransferError[error.result]}`);
    }
    
    logger.info(`[TigerBeetle] Created transfer: ${transferId}`, { debitAccountId: debitAccountId.toString(), creditAccountId: creditAccountId.toString(), amount: amount.toString() });
  } catch (error) {
    logger.error('[TigerBeetle] Failed to create transfer', { error: (error as Error).message });
    throw error;
  }
}

/**
 * Lookup account by ID
 */
export async function lookupAccount(accountId: bigint): Promise<Account | null> {
  try {
    const tbClient = await getTigerBeetleClient();
    if (!tbClient) return null;
    const accounts = await tbClient.lookupAccounts([accountId]);
    return accounts.length === 0 ? null : accounts[0];
  } catch (error) {
    logger.error('[TigerBeetle] Failed to lookup account', { error: (error as Error).message });
    return null;
  }
}

/**
 * Lookup transfer by ID
 */
export async function lookupTransfer(transferId: bigint): Promise<Transfer | null> {
  try {
    const tbClient = await getTigerBeetleClient();
    if (!tbClient) return null;
    const transfers = await tbClient.lookupTransfers([transferId]);
    return transfers.length === 0 ? null : transfers[0];
  } catch (error) {
    logger.error('[TigerBeetle] Failed to lookup transfer', { error: (error as Error).message });
    return null;
  }
}

/**
 * Record expense (debit expense account, credit cash/payable)
 */
export async function recordExpense(
  expenseId: number,
  farmerId: number,
  expenseType: keyof typeof ACCOUNT_TYPES,
  amount: number,
  isPaid: boolean = true
): Promise<void> {
  const ledger = getFarmerLedger(farmerId);
  const expenseAccountCode = ACCOUNT_TYPES[expenseType];
  const amountCents = BigInt(Math.round(amount * 100)); // Convert to cents
  
  // Generate unique account IDs
  const expenseAccountId = BigInt(farmerId) * BigInt(10000) + expenseAccountCode;
  const cashAccountId = BigInt(farmerId) * BigInt(10000) + ACCOUNT_TYPES.CASH;
  const payableAccountId = BigInt(farmerId) * BigInt(10000) + ACCOUNT_TYPES.ACCOUNTS_PAYABLE;
  
  // Ensure accounts exist
  await createAccount(expenseAccountId, ledger, expenseAccountCode);
  await createAccount(cashAccountId, ledger, ACCOUNT_TYPES.CASH);
  await createAccount(payableAccountId, ledger, ACCOUNT_TYPES.ACCOUNTS_PAYABLE);
  
  // Create transfer: debit expense, credit cash (if paid) or payable (if unpaid)
  const transferId = BigInt(Date.now()) * BigInt(1000000) + BigInt(expenseId);
  const creditAccountId = isPaid ? cashAccountId : payableAccountId;
  
  await createTransfer(
    transferId,
    expenseAccountId,
    creditAccountId,
    amountCents,
    ledger,
    expenseAccountCode
  );
}

/**
 * Record revenue (debit cash/receivable, credit revenue account)
 */
export async function recordRevenue(
  harvestId: number,
  farmerId: number,
  revenueType: keyof typeof ACCOUNT_TYPES,
  amount: number,
  isReceived: boolean = true
): Promise<void> {
  const ledger = getFarmerLedger(farmerId);
  const revenueAccountCode = ACCOUNT_TYPES[revenueType];
  const amountCents = BigInt(Math.round(amount * 100)); // Convert to cents
  
  // Generate unique account IDs
  const revenueAccountId = BigInt(farmerId) * BigInt(10000) + revenueAccountCode;
  const cashAccountId = BigInt(farmerId) * BigInt(10000) + ACCOUNT_TYPES.CASH;
  const receivableAccountId = BigInt(farmerId) * BigInt(10000) + ACCOUNT_TYPES.ACCOUNTS_RECEIVABLE;
  
  // Ensure accounts exist
  await createAccount(revenueAccountId, ledger, revenueAccountCode);
  await createAccount(cashAccountId, ledger, ACCOUNT_TYPES.CASH);
  await createAccount(receivableAccountId, ledger, ACCOUNT_TYPES.ACCOUNTS_RECEIVABLE);
  
  // Create transfer: debit cash (if received) or receivable (if not), credit revenue
  const transferId = BigInt(Date.now()) * BigInt(1000000) + BigInt(harvestId);
  const debitAccountId = isReceived ? cashAccountId : receivableAccountId;
  
  await createTransfer(
    transferId,
    debitAccountId,
    revenueAccountId,
    amountCents,
    ledger,
    revenueAccountCode
  );
}

/**
 * Get account balance
 */
export async function getAccountBalance(
  farmerId: number,
  accountType: keyof typeof ACCOUNT_TYPES
): Promise<{ debits: bigint; credits: bigint; balance: bigint }> {
  const accountCode = ACCOUNT_TYPES[accountType];
  const accountId = BigInt(farmerId) * BigInt(10000) + accountCode;
  
  const account = await lookupAccount(accountId);
  
  if (!account) {
    return { debits: BigInt(0), credits: BigInt(0), balance: BigInt(0) };
  }
  
  const balance = account.debits_posted - account.credits_posted;
  
  return {
    debits: account.debits_posted,
    credits: account.credits_posted,
    balance,
  };
}

/**
 * Calculate profit/loss for a farmer
 */
export async function calculateProfitLoss(farmerId: number): Promise<{
  totalRevenue: bigint;
  totalExpenses: bigint;
  profitLoss: bigint;
}> {
  // Get all revenue accounts
  const harvestRevenue = await getAccountBalance(farmerId, 'HARVEST_REVENUE');
  const livestockRevenue = await getAccountBalance(farmerId, 'LIVESTOCK_REVENUE');
  const otherRevenue = await getAccountBalance(farmerId, 'OTHER_REVENUE');
  
  const totalRevenue = harvestRevenue.credits + livestockRevenue.credits + otherRevenue.credits;
  
  // Get all expense accounts
  const seedExpense = await getAccountBalance(farmerId, 'SEED_EXPENSE');
  const fertilizerExpense = await getAccountBalance(farmerId, 'FERTILIZER_EXPENSE');
  const pesticideExpense = await getAccountBalance(farmerId, 'PESTICIDE_EXPENSE');
  const laborExpense = await getAccountBalance(farmerId, 'LABOR_EXPENSE');
  const equipmentExpense = await getAccountBalance(farmerId, 'EQUIPMENT_EXPENSE');
  const utilitiesExpense = await getAccountBalance(farmerId, 'UTILITIES_EXPENSE');
  const otherExpense = await getAccountBalance(farmerId, 'OTHER_EXPENSE');
  
  const totalExpenses = 
    seedExpense.debits +
    fertilizerExpense.debits +
    pesticideExpense.debits +
    laborExpense.debits +
    equipmentExpense.debits +
    utilitiesExpense.debits +
    otherExpense.debits;
  
  const profitLoss = totalRevenue - totalExpenses;
  
  return {
    totalRevenue,
    totalExpenses,
    profitLoss,
  };
}

/**
 * Initialize farmer accounts (create all needed accounts)
 */
export async function initializeFarmerAccounts(farmerId: number): Promise<void> {
  const ledger = getFarmerLedger(farmerId);
  
  logger.info(`[TigerBeetle] Initializing accounts for farmer ${farmerId}`);
  
  for (const [, accountCode] of Object.entries(ACCOUNT_TYPES)) {
    const accountId = BigInt(farmerId) * BigInt(10000) + accountCode;
    await createAccount(accountId, ledger, accountCode);
  }
  
  logger.info(`[TigerBeetle] Initialized all accounts for farmer ${farmerId}`);
}
