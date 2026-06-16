import { publishEvent, createEvent, TOPICS, EVENT_TYPES, type KafkaEvent } from './kafka.js';

// Helper to publish multiple events
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function publishMultipleEvents(events: Array<{ topic: string; event: any }>) {
  for (const { topic, event } of events) {
    await publishEvent(topic, event);
  }
}

// ============================================
// MOJALOOP EVENTS
// ============================================

// Mojaloop party lookup event
export async function publishMojaloopPartyLookup(
  partyId: string,
  partyIdType: string,
  userId: number,
  result: { found: boolean; displayName?: string; fspId?: string }
) {
  const event = createEvent(EVENT_TYPES.PARTY_LOOKUP, 'mojaloop_party', partyId, userId, {
    partyId,
    partyIdType,
    ...result,
  });
  await publishMultipleEvents([
    { topic: TOPICS.MOJALOOP_PARTIES, event },
    { topic: TOPICS.AUDIT_TRAIL, event },
    { topic: TOPICS.ANALYTICS, event },
  ]);
}

// Mojaloop quote requested event
export async function publishMojaloopQuoteRequested(
  quoteId: string,
  userId: number,
  data: { payerId: string; payeeId: string; amount: number; currency: string }
) {
  const event = createEvent(EVENT_TYPES.QUOTE_REQUESTED, 'mojaloop_quote', quoteId, userId, data);
  await publishMultipleEvents([
    { topic: TOPICS.MOJALOOP_QUOTES, event },
    { topic: TOPICS.AUDIT_TRAIL, event },
  ]);
}

// Mojaloop quote received event
export async function publishMojaloopQuoteReceived(
  quoteId: string,
  userId: number,
  data: { transferAmount: number; fees: number; expiration: string }
) {
  const event = createEvent(EVENT_TYPES.QUOTE_RECEIVED, 'mojaloop_quote', quoteId, userId, data);
  await publishMultipleEvents([
    { topic: TOPICS.MOJALOOP_QUOTES, event },
    { topic: TOPICS.AUDIT_TRAIL, event },
    { topic: TOPICS.ANALYTICS, event },
  ]);
}

// Mojaloop transfer initiated event
export async function publishMojaloopTransferInitiated(
  transferId: string,
  userId: number,
  data: { payerId: string; payeeId: string; amount: number; currency: string; quoteId?: string }
) {
  const event = createEvent(EVENT_TYPES.TRANSFER_INITIATED, 'mojaloop_transfer', transferId, userId, data);
  await publishMultipleEvents([
    { topic: TOPICS.MOJALOOP_TRANSFERS, event },
    { topic: TOPICS.PAYMENT_EVENTS, event },
    { topic: TOPICS.AUDIT_TRAIL, event },
    { topic: TOPICS.NOTIFICATIONS, event: { ...event, notificationType: 'TRANSFER_INITIATED' } },
  ]);
}

// Mojaloop transfer completed event
export async function publishMojaloopTransferCompleted(
  transferId: string,
  userId: number,
  data: { payerId: string; payeeId: string; amount: number; currency: string; completedTimestamp: string }
) {
  const event = createEvent(EVENT_TYPES.TRANSFER_COMPLETED, 'mojaloop_transfer', transferId, userId, data);
  await publishMultipleEvents([
    { topic: TOPICS.MOJALOOP_TRANSFERS, event },
    { topic: TOPICS.PAYMENT_EVENTS, event },
    { topic: TOPICS.AUDIT_TRAIL, event },
    { topic: TOPICS.ANALYTICS, event },
    { topic: TOPICS.NOTIFICATIONS, event: { ...event, notificationType: 'TRANSFER_COMPLETED' } },
  ]);
}

// Mojaloop transfer failed event
export async function publishMojaloopTransferFailed(
  transferId: string,
  userId: number,
  data: { payerId: string; payeeId: string; amount: number; errorCode: string; errorDescription: string }
) {
  const event = createEvent(EVENT_TYPES.TRANSFER_FAILED, 'mojaloop_transfer', transferId, userId, data);
  await publishMultipleEvents([
    { topic: TOPICS.MOJALOOP_TRANSFERS, event },
    { topic: TOPICS.PAYMENT_EVENTS, event },
    { topic: TOPICS.AUDIT_TRAIL, event },
    { topic: TOPICS.NOTIFICATIONS, event: { ...event, notificationType: 'TRANSFER_FAILED', priority: 'HIGH' } },
  ]);
}

// Mojaloop settlement event
export async function publishMojaloopSettlement(
  settlementId: string,
  userId: number,
  eventType: 'CREATED' | 'CLOSED',
  data: { windowId: string; state: string; participants?: string[]; totalAmount?: number }
) {
  const event = createEvent(
    eventType === 'CREATED' ? EVENT_TYPES.SETTLEMENT_CREATED : EVENT_TYPES.SETTLEMENT_CLOSED,
    'mojaloop_settlement',
    settlementId,
    userId,
    data
  );
  await publishMultipleEvents([
    { topic: TOPICS.MOJALOOP_SETTLEMENTS, event },
    { topic: TOPICS.AUDIT_TRAIL, event },
    { topic: TOPICS.ANALYTICS, event },
  ]);
}

// ============================================
// TIGERBEETLE EVENTS
// ============================================

// TigerBeetle account created event
export async function publishTigerBeetleAccountCreated(
  accountId: string,
  userId: number,
  data: { entityId: string; entityType: string; accountType: string; ledgerCode: number }
) {
  const event = createEvent(EVENT_TYPES.ACCOUNT_CREATED, 'tigerbeetle_account', accountId, userId, data);
  await publishMultipleEvents([
    { topic: TOPICS.TIGERBEETLE_ACCOUNTS, event },
    { topic: TOPICS.AUDIT_TRAIL, event },
  ]);
}

// TigerBeetle ledger entry posted event
export async function publishTigerBeetleLedgerEntry(
  transferId: string,
  userId: number,
  data: {
    debitAccountId: string;
    creditAccountId: string;
    amount: number;
    ledgerCode: number;
    transactionType: string;
    reference: string;
  }
) {
  const event = createEvent(EVENT_TYPES.LEDGER_ENTRY_POSTED, 'tigerbeetle_transfer', transferId, userId, data);
  await publishMultipleEvents([
    { topic: TOPICS.TIGERBEETLE_LEDGER, event },
    { topic: TOPICS.PAYMENT_EVENTS, event },
    { topic: TOPICS.AUDIT_TRAIL, event },
    { topic: TOPICS.ANALYTICS, event },
  ]);
}

// ============================================
// LOAN DISBURSEMENT/REPAYMENT EVENTS
// ============================================

// Loan disbursement initiated event
export async function publishDisbursementInitiated(
  disbursementId: string,
  userId: number,
  data: { loanId: string; farmerId: string; amount: number; method: string }
) {
  const event = createEvent(EVENT_TYPES.DISBURSEMENT_INITIATED, 'disbursement', disbursementId, userId, data);
  await publishMultipleEvents([
    { topic: TOPICS.LOAN_DISBURSEMENTS, event },
    { topic: TOPICS.PAYMENT_EVENTS, event },
    { topic: TOPICS.AUDIT_TRAIL, event },
    { topic: TOPICS.NOTIFICATIONS, event: { ...event, notificationType: 'DISBURSEMENT_INITIATED' } },
  ]);
}

// Loan disbursement completed event
export async function publishDisbursementCompleted(
  disbursementId: string,
  userId: number,
  data: {
    loanId: string;
    farmerId: string;
    amount: number;
    method: string;
    tigerbeetleTransferId?: string;
    mojaloopTransferId?: string;
  }
) {
  const event = createEvent(EVENT_TYPES.DISBURSEMENT_COMPLETED, 'disbursement', disbursementId, userId, data);
  await publishMultipleEvents([
    { topic: TOPICS.LOAN_DISBURSEMENTS, event },
    { topic: TOPICS.PAYMENT_EVENTS, event },
    { topic: TOPICS.AUDIT_TRAIL, event },
    { topic: TOPICS.ANALYTICS, event },
    { topic: TOPICS.NOTIFICATIONS, event: { ...event, notificationType: 'DISBURSEMENT_COMPLETED' } },
    { topic: TOPICS.CACHE_INVALIDATION, event: { ...event, cacheKeys: [`farmer:${data.farmerId}:balance`, `loan:${data.loanId}`] } },
  ]);
}

// Loan disbursement failed event
export async function publishDisbursementFailed(
  disbursementId: string,
  userId: number,
  data: { loanId: string; farmerId: string; amount: number; errorCode: string; errorMessage: string }
) {
  const event = createEvent(EVENT_TYPES.DISBURSEMENT_FAILED, 'disbursement', disbursementId, userId, data);
  await publishMultipleEvents([
    { topic: TOPICS.LOAN_DISBURSEMENTS, event },
    { topic: TOPICS.PAYMENT_EVENTS, event },
    { topic: TOPICS.AUDIT_TRAIL, event },
    { topic: TOPICS.NOTIFICATIONS, event: { ...event, notificationType: 'DISBURSEMENT_FAILED', priority: 'HIGH' } },
  ]);
}

// Loan repayment received event
export async function publishRepaymentReceived(
  repaymentId: string,
  userId: number,
  data: { loanId: string; farmerId: string; amount: number; principalAmount: number; interestAmount: number }
) {
  const event = createEvent(EVENT_TYPES.REPAYMENT_RECEIVED, 'repayment', repaymentId, userId, data);
  await publishMultipleEvents([
    { topic: TOPICS.LOAN_REPAYMENTS, event },
    { topic: TOPICS.PAYMENT_EVENTS, event },
    { topic: TOPICS.AUDIT_TRAIL, event },
    { topic: TOPICS.NOTIFICATIONS, event: { ...event, notificationType: 'REPAYMENT_RECEIVED' } },
  ]);
}

// Loan repayment processed event
export async function publishRepaymentProcessed(
  repaymentId: string,
  userId: number,
  data: {
    loanId: string;
    farmerId: string;
    amount: number;
    principalAmount: number;
    interestAmount: number;
    tigerbeetleTransferId?: string;
    remainingBalance: number;
  }
) {
  const event = createEvent(EVENT_TYPES.REPAYMENT_PROCESSED, 'repayment', repaymentId, userId, data);
  await publishMultipleEvents([
    { topic: TOPICS.LOAN_REPAYMENTS, event },
    { topic: TOPICS.PAYMENT_EVENTS, event },
    { topic: TOPICS.AUDIT_TRAIL, event },
    { topic: TOPICS.ANALYTICS, event },
    { topic: TOPICS.NOTIFICATIONS, event: { ...event, notificationType: 'REPAYMENT_PROCESSED' } },
    { topic: TOPICS.CACHE_INVALIDATION, event: { ...event, cacheKeys: [`farmer:${data.farmerId}:balance`, `loan:${data.loanId}`] } },
  ]);
}

// Farmer events
export async function publishFarmerCreated(farmerId: number, userId: number, data: Record<string, unknown>) {
  const event = createEvent(EVENT_TYPES.CREATED, 'farmer', farmerId, userId, data);
  await publishMultipleEvents([
    { topic: TOPICS.FARMER_EVENTS, event },
    { topic: TOPICS.CACHE_INVALIDATION, event: { ...event, cacheKeys: [`farmers:${userId}`, `dashboard:${userId}`] } },
    { topic: TOPICS.AUDIT_TRAIL, event },
  ]);
}

export async function publishFarmerUpdated(farmerId: number, userId: number, data: Record<string, unknown>) {
  const event = createEvent(EVENT_TYPES.UPDATED, 'farmer', farmerId, userId, data);
  await publishMultipleEvents([
    { topic: TOPICS.FARMER_EVENTS, event },
    { topic: TOPICS.CACHE_INVALIDATION, event: { ...event, cacheKeys: [`farmers:${userId}`, `farmer:${farmerId}`, `dashboard:${userId}`] } },
    { topic: TOPICS.AUDIT_TRAIL, event },
  ]);
}

export async function publishFarmerDeleted(farmerId: number, userId: number) {
  const event = createEvent(EVENT_TYPES.DELETED, 'farmer', farmerId, userId, { farmerId });
  await publishMultipleEvents([
    { topic: TOPICS.FARMER_EVENTS, event },
    { topic: TOPICS.CACHE_INVALIDATION, event: { ...event, cacheKeys: [`farmers:${userId}`, `farmer:${farmerId}`, `dashboard:${userId}`] } },
    { topic: TOPICS.AUDIT_TRAIL, event },
  ]);
}

// Authentication events
export async function publishUserLogin(userId: number, email: string, metadata?: Record<string, unknown>) {
  const event = createEvent(EVENT_TYPES.LOGIN, 'user', userId, userId, { email }, metadata);
  await publishMultipleEvents([
    { topic: TOPICS.AUTH_EVENTS, event },
    { topic: TOPICS.AUDIT_TRAIL, event },
    { topic: TOPICS.ANALYTICS, event },
  ]);
}

export async function publishUserRegistered(userId: number, email: string, data: Record<string, unknown>) {
  const event = createEvent(EVENT_TYPES.REGISTER, 'user', userId, userId, { email, ...data });
  await publishMultipleEvents([
    { topic: TOPICS.AUTH_EVENTS, event },
    { topic: TOPICS.AUDIT_TRAIL, event },
    { topic: TOPICS.ANALYTICS, event },
  ]);
}
