/**
 * Banking Service — Mojaloop Integration
 *
 * Real HTTP integration with the Mojaloop payment switch for:
 *  - Party lookup (finding recipients via FSPIOP API)
 *  - Quote requests (getting transfer fees/rates)
 *  - Transfer initiation (sending money)
 *  - Transaction status tracking
 *
 * Uses circuit breaker + exponential-backoff retry.
 */
import { logger } from '../logger.js';
import { CircuitBreaker, fetchWithRetry } from './circuit-breaker.js';

export interface MojaloopPartyLookupResult {
  partyId: string;
  partyIdType: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
}

export interface MojaloopQuoteResult {
  quoteId: string;
  transferAmount: number;
  payeeReceiveAmount: number;
  fees: number;
  commission: number;
  expiration: string;
}

export interface MojaloopTransferResult {
  transferId: string;
  transactionId: string;
  status: string;
  completedTimestamp?: string;
  errorCode?: string;
  errorDescription?: string;
}

const mojaloopBreaker = new CircuitBreaker({
  name: 'mojaloop',
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  timeoutMs: 15_000,
});

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/vnd.interoperability.parties+json;version=1.1',
    'Accept': 'application/vnd.interoperability.parties+json;version=1.1',
    'FSPIOP-Source': process.env.MOJALOOP_FSP_ID || 'farmer-fsp',
    'Date': new Date().toUTCString(),
  };
}

export class BankingService {
  private apiUrl: string;

  constructor() {
    this.apiUrl = process.env.MOJALOOP_API_URL || 'http://localhost:4001';
  }

  async lookupParty(
    partyId: string,
    partyIdType: 'MSISDN' | 'ACCOUNT_ID' | 'EMAIL'
  ): Promise<MojaloopPartyLookupResult> {
    logger.info('[Mojaloop] Party lookup', { partyIdType, partyId });
    try {
      const res = await fetchWithRetry(
        `${this.apiUrl}/parties/${partyIdType}/${partyId}`,
        { method: 'GET', headers: headers(), retries: 2 },
        mojaloopBreaker
      );

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Mojaloop party lookup failed: HTTP ${res.status} — ${body}`);
      }

      const data = (await res.json()) as { party?: { partyIdInfo?: { partyIdentifier?: string; partyIdType?: string }; name?: string; personalInfo?: { complexName?: { firstName?: string; lastName?: string }; dateOfBirth?: string } } };
      const party = data.party;
      return {
        partyId: party?.partyIdInfo?.partyIdentifier || partyId,
        partyIdType: party?.partyIdInfo?.partyIdType || partyIdType,
        displayName: party?.name || `User ${partyId}`,
        firstName: party?.personalInfo?.complexName?.firstName,
        lastName: party?.personalInfo?.complexName?.lastName,
        dateOfBirth: party?.personalInfo?.dateOfBirth,
      };
    } catch (error) {
      logger.error('[Mojaloop] Party lookup failed', { error: (error as Error).message, partyId });
      throw new Error('Failed to lookup party in Mojaloop network');
    }
  }

  async requestQuote(
    payerPartyId: string,
    payerPartyIdType: string,
    payeePartyId: string,
    payeePartyIdType: string,
    amount: number,
    currency: string
  ): Promise<MojaloopQuoteResult> {
    logger.info('[Mojaloop] Requesting quote', { amount, currency });
    const quoteId = crypto.randomUUID();
    try {
      const res = await fetchWithRetry(
        `${this.apiUrl}/quotes`,
        {
          method: 'POST',
          headers: {
            ...headers(),
            'Content-Type': 'application/vnd.interoperability.quotes+json;version=1.1',
            'Accept': 'application/vnd.interoperability.quotes+json;version=1.1',
          },
          body: JSON.stringify({
            quoteId,
            transactionId: crypto.randomUUID(),
            payer: { partyIdInfo: { partyIdType: payerPartyIdType, partyIdentifier: payerPartyId, fspId: process.env.MOJALOOP_FSP_ID || 'farmer-fsp' } },
            payee: { partyIdInfo: { partyIdType: payeePartyIdType, partyIdentifier: payeePartyId } },
            amountType: 'SEND',
            amount: { amount: amount.toString(), currency },
            transactionType: { scenario: 'TRANSFER', initiator: 'PAYER', initiatorType: 'CONSUMER' },
          }),
          retries: 2,
        },
        mojaloopBreaker
      );

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Mojaloop quote failed: HTTP ${res.status} — ${body}`);
      }

      const data = (await res.json()) as {
        transferAmount?: { amount?: string };
        payeeReceiveAmount?: { amount?: string };
        payeeFspFee?: { amount?: string };
        payeeFspCommission?: { amount?: string };
        expiration?: string;
      };
      const fees = parseFloat(data.payeeFspFee?.amount || '0');
      const commission = parseFloat(data.payeeFspCommission?.amount || '0');
      return {
        quoteId,
        transferAmount: amount,
        payeeReceiveAmount: parseFloat(data.payeeReceiveAmount?.amount || String(amount - fees - commission)),
        fees,
        commission,
        expiration: data.expiration || new Date(Date.now() + 30 * 60_000).toISOString(),
      };
    } catch (error) {
      logger.error('[Mojaloop] Quote request failed', { error: (error as Error).message });
      throw new Error('Failed to get quote from Mojaloop');
    }
  }

  async initiateMojaloopTransfer(
    toPartyId: string,
    toPartyIdType: 'MSISDN' | 'ACCOUNT_ID' | 'EMAIL',
    amount: number,
    currency: string
  ): Promise<MojaloopTransferResult> {
    logger.info('[Mojaloop] Initiating transfer', { amount, currency, toPartyId });
    const transferId = crypto.randomUUID();
    try {
      const res = await fetchWithRetry(
        `${this.apiUrl}/transfers`,
        {
          method: 'POST',
          headers: {
            ...headers(),
            'Content-Type': 'application/vnd.interoperability.transfers+json;version=1.1',
            'Accept': 'application/vnd.interoperability.transfers+json;version=1.1',
          },
          body: JSON.stringify({
            transferId,
            payerFsp: process.env.MOJALOOP_FSP_ID || 'farmer-fsp',
            payeeFsp: 'unknown',
            amount: { amount: amount.toString(), currency },
            ilpPacket: '',
            condition: '',
            expiration: new Date(Date.now() + 60_000).toISOString(),
          }),
          retries: 1,
        },
        mojaloopBreaker
      );

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Mojaloop transfer failed: HTTP ${res.status} — ${body}`);
      }

      const data = (await res.json()) as {
        transferState?: string;
        completedTimestamp?: string;
      };
      return {
        transferId,
        transactionId: crypto.randomUUID(),
        status: data.transferState === 'COMMITTED' ? 'COMPLETED' : 'PENDING',
        completedTimestamp: data.completedTimestamp,
      };
    } catch (error) {
      logger.error('[Mojaloop] Transfer failed', { error: (error as Error).message, transferId });
      throw new Error('Failed to initiate Mojaloop transfer');
    }
  }

  async getTransferStatus(transferId: string): Promise<MojaloopTransferResult> {
    logger.info('[Mojaloop] Checking transfer status', { transferId });
    try {
      const res = await fetchWithRetry(
        `${this.apiUrl}/transfers/${transferId}`,
        { method: 'GET', headers: headers(), retries: 2 },
        mojaloopBreaker
      );

      if (!res.ok) {
        throw new Error(`Mojaloop status check failed: HTTP ${res.status}`);
      }

      const data = (await res.json()) as {
        transferState?: string;
        completedTimestamp?: string;
      };
      return {
        transferId,
        transactionId: '',
        status: data.transferState === 'COMMITTED' ? 'COMPLETED' : (data.transferState || 'PENDING'),
        completedTimestamp: data.completedTimestamp,
      };
    } catch (error) {
      logger.error('[Mojaloop] Status check failed', { error: (error as Error).message, transferId });
      throw new Error('Failed to check transfer status');
    }
  }

  async verifyBankAccount(accountNumber: string, bankCode: string): Promise<boolean> {
    logger.info('[Mojaloop] Verifying account', { accountNumber: accountNumber.slice(-4), bankCode });
    try {
      const res = await fetchWithRetry(
        `${this.apiUrl}/parties/ACCOUNT_ID/${bankCode}${accountNumber}`,
        { method: 'GET', headers: headers(), retries: 2 },
        mojaloopBreaker
      );
      return res.ok;
    } catch (error) {
      logger.error('[Mojaloop] Account verification failed', { error: (error as Error).message });
      return false;
    }
  }

  getCircuitBreakerState() {
    return mojaloopBreaker.getState();
  }
}
