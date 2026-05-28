import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import helmet from "helmet";
import { config } from "dotenv";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter, createContext } from "./trpc.js";
import { getMetrics, metricsMiddleware } from "./metrics.js";
import { getRedisClient, closeRedis } from "./redis.js";
import { httpCacheHeaders, staticCacheHeaders } from "./cache/http-cache-headers.js";
import { getCacheStats } from "./cache/cache-layer.js";
import { initRedis, closeRedis as closeRateLimitRedis } from "./_core/redis.js";
import { startAllConsumers, stopAllConsumers, getConsumerHealth } from "./consumers/consumer-manager.js";
import { startAllConsumers as startKafkaConsumers, stopAllConsumers as stopKafkaConsumers } from "./kafka-consumers.js";
import { initializeTopics } from "./kafka.js";
import { initializeCronJobs, shutdownCronJobs } from "./init-cron.js";
import { startSmsScheduler } from "./jobs/sms-scheduler.js";
import { initWebSocketServer } from "./websocket-server.js";
import websocketApiRouter from "./websocket-api-router.js";
import { seedDatabase } from "./seed-data.js";
import ussdRouter from "./routes/ussd.routes.js";
import smsRouter from "./routes/sms.routes.js";
import whatsappRouter from "./routes/whatsapp.routes.js";
import { initializeLakehouse, shutdownLakehouse, getLakehouseStatus } from "./services/lakehouse/index.js";
import { rateLimiters } from "./middleware/rate-limiter.js";
import { tracingMiddleware } from './services/tracing.js';
import { startPoolMonitor, getPoolMetrics, getPrometheusMetrics as getPoolPrometheusMetrics } from './services/db-pool-monitor.js';
import { logger } from './logger.js';

// Load environment variables from .env.local (override system env vars)
config({ path: ".env.local", override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction = process.env.NODE_ENV === "production";
const allowedOrigins = (process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173']
)
  .map((origin) => origin.trim())
  .filter(Boolean);

function isAllowedOrigin(origin?: string | null) {
  if (!origin) return true;
  if (!isProduction) {
    if (origin.includes('manusvm.computer') || origin.includes('manus.computer')) {
      return true;
    }
    // Allow any localhost origin in development (Vite may use varying ports)
    if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      return true;
    }
  }
  return allowedOrigins.includes(origin);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Security headers with helmet
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        scriptSrc: isProduction
          ? ["'self'", "'unsafe-inline'"]
          : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: [
          "'self'",
          "https://maps.googleapis.com",
          "https://*.manus.computer",
          "wss://*.manus.computer",
          ...allowedOrigins,
          ...allowedOrigins.map((origin) => origin.replace(/^http/i, 'ws')),
        ],
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));

  app.set('trust proxy', 1);

  // Enable CORS with explicit allowlist configuration
  app.use(cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  }));
  
  // Parse JSON bodies with size limit
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  
  // Metrics middleware
  app.use(metricsMiddleware());

  // Distributed tracing (OpenTelemetry → Jaeger)
  app.use(tracingMiddleware() as express.RequestHandler);
  
  // HTTP cache headers (Cache-Control, ETag, 304 Not Modified)
  app.use(httpCacheHeaders());
  
  // Initialize Redis connection for caching
  try {
    const redis = getRedisClient();
    if (redis) {
      logger.info('[Server] Redis client initialized for caching');
    } else {
      logger.warn('[Server] Redis unavailable — running without cache');
    }
  } catch (error) {
    logger.warn('[Server] Redis caching connection failed, continuing without cache:', error);
  }

  // Initialize Redis connection for rate limiting (with fallback to in-memory)
  try {
    initRedis();
    logger.info('[Server] Redis rate limiting initialized (will fallback to in-memory if unavailable)');
  } catch (error) {
    logger.warn('[Server] Redis rate limiting initialization failed, using in-memory fallback:', error);
  }

  // ============ API Documentation (OpenAPI/Swagger) ============
  try {
    const { registerOpenAPIDocs } = await import('./services/openapi-generator.js');
    registerOpenAPIDocs(app);
  } catch (err) {
    logger.warn('[Server] OpenAPI generator registration failed:', err);
  }
  app.get('/docs/openapi.json', (_req, res) => {
    import('./openapi-docs.js').then(({ generateOpenAPISpec }) => {
      res.json(generateOpenAPISpec());
    }).catch(() => res.status(500).json({ error: 'Failed to generate spec' }));
  });

  app.get('/docs', (_req, res) => {
    import('./openapi-docs.js').then(({ getSwaggerUIHTML }) => {
      res.setHeader('Content-Type', 'text/html');
      res.send(getSwaggerUIHTML('/docs/openapi.json'));
    }).catch(() => res.status(500).send('Failed to load docs'));
  });

  // ============ GraphQL Gateway ============
  app.get('/graphql/schema', (_req, res) => {
    import('./graphql-gateway.js').then(({ generateGraphQLSchema }) => {
      res.setHeader('Content-Type', 'text/plain');
      res.send(generateGraphQLSchema());
    }).catch(() => res.status(500).send('Failed to generate schema'));
  });

  // Liveness probe - basic health check
  app.get('/health', async (_req, res) => {
    try {
      const redis = getRedisClient();
      let redisStatus = 'disconnected';
      if (redis) {
        await redis.ping();
        redisStatus = 'connected';
      }
      const consumerHealth = getConsumerHealth();
      res.json({ 
        status: 'ok', 
        version: process.env.APP_VERSION || '1.0.0',
        redis: redisStatus,
        consumers: consumerHealth
      });
    } catch (error) {
      res.status(503).json({ status: 'degraded', redis: 'disconnected' });
    }
  });

  // Kubernetes liveness probe alias
  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Cache stats endpoint
  app.get('/cache/stats', (_req, res) => {
    const stats = getCacheStats();
    res.json({ status: 'ok', ...stats, timestamp: new Date().toISOString() });
  });

  // Kubernetes readiness probe - checks if app is ready to receive traffic
  app.get('/readyz', async (_req, res) => {
    const checks: Record<string, { status: string; latency?: number }> = {};
    let allHealthy = true;

    // Check database connection
    try {
      const start = Date.now();
      const { getDb } = await import('./db.js');
      const db = await getDb();
      if (db) {
        checks.database = { status: 'ok', latency: Date.now() - start };
      } else {
        checks.database = { status: 'unavailable' };
        allHealthy = false;
      }
    } catch (error) {
      checks.database = { status: 'error' };
      allHealthy = false;
    }

    // Check Redis connection
    try {
      const start = Date.now();
      const redis = getRedisClient();
      if (redis) {
        await redis.ping();
        checks.redis = { status: 'ok', latency: Date.now() - start };
      } else {
        checks.redis = { status: 'unavailable' };
      }
    } catch (error) {
      checks.redis = { status: 'unavailable' };
      // Redis is optional, don't fail readiness
    }

    // Check consumer health
    try {
      const consumerHealth = getConsumerHealth();
      const isHealthy = consumerHealth.running === consumerHealth.total && !consumerHealth.isShuttingDown;
      checks.consumers = { status: isHealthy ? 'ok' : 'degraded' };
    } catch (error) {
      checks.consumers = { status: 'unknown' };
    }

    const status = allHealthy ? 200 : 503;
    res.status(status).json({
      status: allHealthy ? 'ready' : 'not_ready',
      checks,
      timestamp: new Date().toISOString(),
    });
  });
  
  // Metrics endpoint for Prometheus
  app.get('/metrics', async (_req, res) => {
    try {
      res.set('Content-Type', 'text/plain');
      const metrics = await getMetrics();
      const poolMetrics = getPoolPrometheusMetrics();
      res.send(metrics + '\n' + poolMetrics);
    } catch (error) {
      res.status(500).send('Error collecting metrics');
    }
  });

  // DB pool metrics endpoint
  app.get('/api/pool-metrics', (_req, res) => {
    const metrics = getPoolMetrics();
    if (metrics) {
      res.json(metrics);
    } else {
      res.json({ status: 'monitor_not_started', message: 'Pool monitor starts after DB connection' });
    }
  });
  
    // WebSocket API endpoints
    app.use("/api/websocket", websocketApiRouter);
  
    // USSD API endpoints - apply messaging rate limit
    app.use("/api/ussd", rateLimiters.messaging, ussdRouter);
  
    // SMS API endpoints - apply messaging rate limit
    app.use("/api/sms", rateLimiters.messaging, smsRouter);
  
    // WhatsApp API endpoints - apply messaging rate limit
    app.use("/api/whatsapp", rateLimiters.messaging, whatsappRouter);
  
    // tRPC endpoint - apply standard API rate limit
    app.use(
      "/api/trpc",
      rateLimiters.api,
      createExpressMiddleware({
        router: appRouter,
        createContext,
      })
    );

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3001;

  // Initialize WebSocket server
  const wsServer = initWebSocketServer(server);
  logger.info('[Server] WebSocket server initialized');
  
  server.listen(port, async () => {
    logger.info(`Server running on http://localhost:${port}/`);
    logger.info(`tRPC endpoint available at http://localhost:${port}/api/trpc`);
    logger.info(`WebSocket server available at ws://localhost:${port}/socket.io/`);
    logger.info(`WebSocket API available at http://localhost:${port}/api/websocket`);
    logger.info(`Health check available at http://localhost:${port}/health`);
    logger.info(`Metrics available at http://localhost:${port}/metrics`);
    
    // Initialize Kafka topics
    try {
      await initializeTopics();
      logger.info('[Server] Kafka topics initialized');
    } catch (error) {
      logger.error('[Server] Failed to initialize Kafka topics:', error);
      logger.warn('[Server] Continuing without Kafka');
    }
    
    // Start Kafka event consumers
    try {
      await startKafkaConsumers();
      logger.info('[Server] Kafka event consumers started');
    } catch (error) {
      logger.error('[Server] Failed to start Kafka event consumers:', error);
      logger.warn('[Server] Continuing without Kafka event consumers');
    }
    
    // Start Dapr consumers
    try {
      await startAllConsumers();
      logger.info('[Server] Dapr consumers started');
    } catch (error) {
      logger.error('[Server] Failed to start Dapr consumers:', error);
      logger.warn('[Server] Continuing without Dapr consumers');
    }
    
    // Start agricultural monitoring cron jobs
    try {
      initializeCronJobs();
      logger.info('[Server] Agricultural monitoring cron jobs started');
    } catch (error) {
      logger.error('[Server] Failed to start cron jobs:', error);
      logger.warn('[Server] Continuing without cron jobs');
    }

        // Start SMS scheduler
        try {
          startSmsScheduler();
          logger.info('[Server] SMS scheduler started');
        } catch (error) {
          logger.error('[Server] Failed to start SMS scheduler:', error);
          logger.warn('[Server] Continuing without SMS scheduler');
        }

        // Initialize Lakehouse for analytics and ML
        try {
          await initializeLakehouse();
          const lakehouseStatus = getLakehouseStatus();
          logger.info('[Server] Lakehouse initialized:', lakehouseStatus);
        } catch (error) {
          logger.error('[Server] Failed to initialize Lakehouse:', error);
          logger.warn('[Server] Continuing without Lakehouse - analytics/ML features will be limited');
        }

        // Start database backup scheduler
        try {
          const { startBackupScheduler } = await import('./services/database-backup-service.js');
          startBackupScheduler();
          logger.info('[Server] Database backup scheduler started');
        } catch (error) {
          logger.error('[Server] Failed to start backup scheduler:', error);
          logger.warn('[Server] Continuing without automated backups');
        }

        // Seed database with test data (only in development)
    // Commented out - use registration page to create users
    // if (process.env.NODE_ENV !== 'production') {
    //   try {
    //     await seedDatabase();
    //     logger.info('[Server] Database seeded with test data');
    //   } catch (error) {
    //     logger.error('[Server] Failed to seed database:', error);
    //     logger.warn('[Server] Continuing without seed data');
    //   }
    // }
  });
  
    // Graceful shutdown — close ALL connections
    async function gracefulShutdown(signal: string) {
      logger.info(`[Server] ${signal} received, shutting down gracefully...`);
      const timeout = setTimeout(() => {
        logger.error('[Server] Graceful shutdown timed out, forcing exit');
        process.exit(1);
      }, 15_000);

      try {
        shutdownCronJobs();
        try {
          const { stopBackupScheduler } = await import('./services/database-backup-service.js');
          stopBackupScheduler();
        } catch (err) { /* backup scheduler may not be loaded */ }
        await Promise.allSettled([
          stopKafkaConsumers(),
          stopAllConsumers(),
          shutdownLakehouse(),
        ]);

        // Close Redis
        await closeRedis().catch((e) => logger.debug('[Shutdown] Redis close error (non-fatal)', { err: e }));

        // Close Kafka
        const { disconnectKafka } = await import('./kafka.js');
        await disconnectKafka().catch((e) => logger.debug('[Shutdown] Kafka disconnect error (non-fatal)', { err: e }));

        // Close database pool
        const { closeDb } = await import('./db.js');
        await closeDb().catch((e) => logger.debug('[Shutdown] DB close error (non-fatal)', { err: e }));

        // Close TigerBeetle
        const { closeTigerBeetle } = await import('./tigerbeetle-client.js');
        if (typeof closeTigerBeetle === 'function') await closeTigerBeetle().catch((e) => logger.debug('[Shutdown] TigerBeetle close error (non-fatal)', { err: e }));

        // Close Dapr
        const { stopDaprServer } = await import('./dapr-client.js');
        await stopDaprServer().catch((e) => logger.debug('[Shutdown] Dapr stop error (non-fatal)', { err: e }));

        server.close(() => {
          clearTimeout(timeout);
          logger.info('[Server] All connections closed');
          process.exit(0);
        });
      } catch (err) {
        logger.error('[Server] Error during shutdown:', err);
        clearTimeout(timeout);
        process.exit(1);
      }
    }

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

startServer().catch((err) => logger.error("Server startup failed", { error: String(err) }));
