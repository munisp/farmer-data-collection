/**
 * Initialize Agricultural Monitoring Cron Jobs
 * 
 * This file is imported by server/index.ts to start all monitoring jobs
 */

import { startAllMonitoring, stopAllMonitoring, getMonitoringStatus } from './services/agricultural-monitoring-cron.js';
import { startPaymentReminderCron } from './cron/payment-reminders.js';
import { initPaymentReminderCron } from './services/payment-reminder-cron.js';
import { initERPNextSyncScheduler } from './cron/erpnext-sync-scheduler.js';

// Start all monitoring jobs when server starts
export function initializeCronJobs() {
  console.log('[Init] Initializing agricultural monitoring cron jobs...');
  
  try {
    startAllMonitoring();
    console.log('[Init] Agricultural monitoring cron jobs initialized successfully');
    
    // Start payment reminder cron job (old version)
    // startPaymentReminderCron();
    
    // Start new payment reminder cron job (3 days before due date)
    initPaymentReminderCron();
    console.log('[Init] Payment reminder cron job initialized successfully');
    
    // ERPNext sync scheduler disabled (ERPNext not configured)
    // initERPNextSyncScheduler();
    // console.log('[Init] ERPNext sync scheduler initialized successfully');
    
    // Log status
    const status = getMonitoringStatus();
    console.log(`[Init] Active monitoring jobs: ${status.active}`);
    console.log('[Init] Jobs:', status.jobs);
  } catch (error) {
    console.error('[Init] Error initializing cron jobs:', error);
  }
}

// Graceful shutdown
export function shutdownCronJobs() {
  console.log('[Shutdown] Stopping agricultural monitoring cron jobs...');
  
  try {
    stopAllMonitoring();
    console.log('[Shutdown] All cron jobs stopped successfully');
  } catch (error) {
    console.error('[Shutdown] Error stopping cron jobs:', error);
  }
}

// Handle process termination
process.on('SIGTERM', () => {
  console.log('[Process] SIGTERM received, shutting down cron jobs...');
  shutdownCronJobs();
});

process.on('SIGINT', () => {
  console.log('[Process] SIGINT received, shutting down cron jobs...');
  shutdownCronJobs();
  process.exit(0);
});
