/**
 * TigerBeetle-PostgreSQL Reconciliation Service
 * Ensures consistency between TigerBeetle ledger and PostgreSQL database
 */

import { db } from '../db';
import { loans } from '../../drizzle/financial-schema';
import { eq } from 'drizzle-orm';
import { TigerBeetleLedger } from './tigerbeetle-ledger';
import { publishEvent, createEvent, TOPICS, EVENT_TYPES } from '../kafka';
import { logger } from '../logger.js';

interface ReconciliationResult {
  status: 'success' | 'discrepancy' | 'error';
  timestamp: Date;
  entityType: string;
  entityId: string;
  postgresValue: number;
  tigerBeetleValue: number;
  difference: number;
  action?: string;
}

interface ReconciliationReport {
  runId: string;
  startTime: Date;
  endTime: Date;
  totalRecords: number;
  successCount: number;
  discrepancyCount: number;
  errorCount: number;
  results: ReconciliationResult[];
}

export class TigerBeetlePostgresReconciliation {
  private ledger: TigerBeetleLedger;
  private connected: boolean = false;

  constructor() {
    this.ledger = new TigerBeetleLedger();
  }

  async connect(): Promise<void> {
    const tbAddress = process.env.TIGERBEETLE_ADDRESS || '127.0.0.1:3000';
    await this.ledger.connect([tbAddress]);
    this.connected = true;
    logger.info('[Reconciliation] Connected to TigerBeetle');
  }

  async disconnect(): Promise<void> {
    await this.ledger.disconnect();
    this.connected = false;
  }

  /**
   * Reconcile loan balances between PostgreSQL and TigerBeetle
   */
  async reconcileLoanBalances(): Promise<ReconciliationReport> {
    const runId = `recon-${Date.now()}`;
    const startTime = new Date();
    const results: ReconciliationResult[] = [];

    logger.info(`[Reconciliation] Starting loan balance reconciliation: ${runId}`);

    try {
      if (!db) {
        throw new Error('Database connection is not available');
      }

      // Get all active loans from PostgreSQL
      const activeLoans = await db.select({
        id: loans.id,
        userId: loans.userId,
        principalAmount: loans.principalAmount,
        outstandingBalance: loans.outstandingBalance,
        status: loans.status,
      })
      .from(loans)
      .where(eq(loans.status, 'active'));

      for (const loan of activeLoans) {
        try {
          // Get balance from TigerBeetle
          const farmerId = loan.userId?.toString() || '';
          const tbSummary = await this.ledger.getFarmerFinancialSummary(farmerId);
          
          const pgBalance = Number(loan.outstandingBalance || 0);
          const tbBalance = Number(tbSummary.outstandingLoans);
          const difference = Math.abs(pgBalance - tbBalance);

          const result: ReconciliationResult = {
            status: difference === 0 ? 'success' : 'discrepancy',
            timestamp: new Date(),
            entityType: 'loan',
            entityId: loan.id.toString(),
            postgresValue: pgBalance,
            tigerBeetleValue: tbBalance,
            difference,
          };

          if (difference > 0) {
            result.action = 'MANUAL_REVIEW_REQUIRED';
            logger.warn(`[Reconciliation] Discrepancy found for loan ${loan.id}: PG=${pgBalance}, TB=${tbBalance}`);
            
            // Publish discrepancy event to Kafka
            await publishEvent(TOPICS.AUDIT_TRAIL, createEvent(
              EVENT_TYPES.UPDATED,
              'loan_reconciliation',
              loan.id.toString(),
              loan.userId ?? 0,
              {
                action: 'RECONCILIATION_DISCREPANCY',
                postgresValue: pgBalance,
                tigerBeetleValue: tbBalance,
                difference,
              }
            ));
          }

          results.push(result);
        } catch (error) {
          results.push({
            status: 'error',
            timestamp: new Date(),
            entityType: 'loan',
            entityId: loan.id.toString(),
            postgresValue: Number(loan.outstandingBalance || 0),
            tigerBeetleValue: 0,
            difference: 0,
            action: `ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }
      }
    } catch (error) {
      logger.error('[Reconciliation] Error during loan reconciliation:', error);
    }

    const endTime = new Date();
    const report: ReconciliationReport = {
      runId,
      startTime,
      endTime,
      totalRecords: results.length,
      successCount: results.filter(r => r.status === 'success').length,
      discrepancyCount: results.filter(r => r.status === 'discrepancy').length,
      errorCount: results.filter(r => r.status === 'error').length,
      results,
    };

    // Store reconciliation report
    await this.storeReconciliationReport(report);

    return report;
  }

  /**
   * Sync PostgreSQL loan status with TigerBeetle balances
   */
  async syncLoanStatuses(): Promise<{ updated: number; errors: number }> {
    let updated = 0;
    let errors = 0;

    logger.info('[Reconciliation] Starting loan status sync');

    try {
      if (!db) {
        throw new Error('Database connection is not available');
      }

      const activeLoans = await db.select({
        id: loans.id,
        userId: loans.userId,
        outstandingBalance: loans.outstandingBalance,
      })
      .from(loans)
      .where(eq(loans.status, 'active'));

      for (const loan of activeLoans) {
        try {
          const farmerId = loan.userId?.toString() || '';
          const tbSummary = await this.ledger.getFarmerFinancialSummary(farmerId);
          
          // If TigerBeetle shows zero outstanding, mark loan as paid
          if (tbSummary.outstandingLoans === 0n && Number(loan.outstandingBalance) > 0) {
            await db.update(loans)
              .set({ 
                status: 'paid_off',
                outstandingBalance: 0,
                updatedAt: new Date(),
              })
              .where(eq(loans.id, loan.id));
            
            updated++;
            logger.info(`[Reconciliation] Marked loan ${loan.id} as paid based on TigerBeetle balance`);

            // Publish sync event
            await publishEvent(TOPICS.AUDIT_TRAIL, createEvent(
              EVENT_TYPES.UPDATED,
              'loan',
              loan.id,
              loan.userId ?? 0,
              {
                action: 'LOAN_STATUS_SYNCED',
                newStatus: 'paid',
                source: 'tigerbeetle_reconciliation',
              }
            ));
          }
        } catch (error) {
          errors++;
          logger.error(`[Reconciliation] Error syncing loan ${loan.id}:`, error);
        }
      }
    } catch (error) {
      logger.error('[Reconciliation] Error during loan status sync:', error);
    }

    return { updated, errors };
  }

  /**
   * Store reconciliation report in PostgreSQL for audit trail
   */
  private async storeReconciliationReport(report: ReconciliationReport): Promise<void> {
    try {
      // Store in audit trail via Kafka
      await publishEvent(TOPICS.AUDIT_TRAIL, createEvent(
        EVENT_TYPES.UPDATED,
        'reconciliation_report',
        report.runId,
        'system',
        {
          startTime: report.startTime.toISOString(),
          endTime: report.endTime.toISOString(),
          totalRecords: report.totalRecords,
          successCount: report.successCount,
          discrepancyCount: report.discrepancyCount,
          errorCount: report.errorCount,
          summary: {
            successRate: report.totalRecords > 0
              ? ((report.successCount / report.totalRecords) * 100).toFixed(2) + '%'
              : '0%',
            discrepancies: report.results
              .filter(r => r.status === 'discrepancy')
              .map(r => ({
                entityType: r.entityType,
                entityId: r.entityId,
                difference: r.difference,
              })),
          },
        }
      ));

      logger.info(`[Reconciliation] Report ${report.runId} stored in audit trail`);
    } catch (error) {
      logger.error('[Reconciliation] Error storing report:', error);
    }
  }

  /**
   * Run full reconciliation (scheduled job)
   */
  async runFullReconciliation(): Promise<{
    loanReport: ReconciliationReport;
    syncResult: { updated: number; errors: number };
  }> {
    logger.info('[Reconciliation] Starting full reconciliation run');

    const loanReport = await this.reconcileLoanBalances();
    const syncResult = await this.syncLoanStatuses();

    logger.info(`[Reconciliation] Full reconciliation complete:
      - Loans checked: ${loanReport.totalRecords}
      - Discrepancies: ${loanReport.discrepancyCount}
      - Statuses synced: ${syncResult.updated}
      - Errors: ${loanReport.errorCount + syncResult.errors}`);

    return { loanReport, syncResult };
  }
}

// Factory function
export function createReconciliationService(): TigerBeetlePostgresReconciliation {
  return new TigerBeetlePostgresReconciliation();
}

// Scheduled reconciliation job (to be called by Temporal or cron)
export async function runScheduledReconciliation(): Promise<void> {
  const service = createReconciliationService();
  
  try {
    await service.connect();
    await service.runFullReconciliation();
  } finally {
    await service.disconnect();
  }
}

export default TigerBeetlePostgresReconciliation;
