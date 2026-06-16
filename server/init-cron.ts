/**
 * Initialize Agricultural Monitoring Cron Jobs
 * 
 * This file is imported by server/index.ts to start all monitoring jobs
 */

import { startAllMonitoring, stopAllMonitoring, getMonitoringStatus } from './services/agricultural-monitoring-cron.js';
import { startPaymentReminderCron } from './cron/payment-reminders.js';
import { initPaymentReminderCron } from './services/payment-reminder-cron.js';
import { performScheduledSync } from './cron/erpnext-sync-scheduler.js';
import { logger } from './logger.js';

// Start all monitoring jobs when server starts
export function initializeCronJobs() {
  logger.info('[Init] Initializing agricultural monitoring cron jobs...');
  
  try {
    startAllMonitoring();
    logger.info('[Init] Agricultural monitoring cron jobs initialized successfully');
    
    // Start payment reminder cron job (old version)
    // startPaymentReminderCron();
    
    // Start new payment reminder cron job (3 days before due date)
    initPaymentReminderCron();
    logger.info('[Init] Payment reminder cron job initialized successfully');
    
    // ERPNext sync scheduler disabled (ERPNext not configured)
    // initERPNextSyncScheduler();
    // logger.info('[Init] ERPNext sync scheduler initialized successfully');
    
    // Log status
    const status = getMonitoringStatus();
    logger.info(`[Init] Active monitoring jobs: ${status.active}`);
    logger.info('[Init] Jobs:', status.jobs);
  } catch (error) {
    logger.error('[Init] Error initializing cron jobs:', error);
  }
}

// Graceful shutdown
export function shutdownCronJobs() {
  logger.info('[Shutdown] Stopping agricultural monitoring cron jobs...');
  
  try {
    stopAllMonitoring();
    logger.info('[Shutdown] All cron jobs stopped successfully');
  } catch (error) {
    logger.error('[Shutdown] Error stopping cron jobs:', error);
  }
}

// Handle process termination
process.on('SIGTERM', () => {
  logger.info('[Process] SIGTERM received, shutting down cron jobs...');
  shutdownCronJobs();
});

process.on('SIGINT', () => {
  logger.info('[Process] SIGINT received, shutting down cron jobs...');
  shutdownCronJobs();
  process.exit(0);
});
