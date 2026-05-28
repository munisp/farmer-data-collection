/**
 * Metrics Endpoint
 * 
 * Exposes Prometheus metrics at /metrics for scraping
 */

import { Router } from 'express';
import { register, updateBusinessMetrics } from '../services/prometheus-metrics';
import { getDb } from '../db';
import { logger } from '../logger.js';

const router = Router();

// Metrics endpoint for Prometheus scraping
router.get('/metrics', async (req, res) => {
  try {
    // Update business metrics before serving
    const db = await getDb();
    if (db) {
      await updateBusinessMetrics(db);
    }

    // Set content type for Prometheus
    res.set('Content-Type', register.contentType);
    
    // Send metrics
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    logger.error('[Metrics] Error generating metrics:', error);
    res.status(500).end('Error generating metrics');
  }
});

export default router;
