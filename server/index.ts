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
  if (!isProduction && (origin.includes('manusvm.computer') || origin.includes('manus.computer'))) {
    return true;
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
  
  // Initialize Redis connection for caching
  try {
    const redis = getRedisClient();
    console.log('[Server] Redis client initialized for caching');
  } catch (error) {
    console.warn('[Server] Redis caching connection failed, continuing without cache:', error);
  }

  // Initialize Redis connection for rate limiting (with fallback to in-memory)
  try {
    initRedis();
    console.log('[Server] Redis rate limiting initialized (will fallback to in-memory if unavailable)');
  } catch (error) {
    console.warn('[Server] Redis rate limiting initialization failed, using in-memory fallback:', error);
  }

  // Liveness probe - basic health check
  app.get('/health', async (_req, res) => {
    try {
      const redis = getRedisClient();
      await redis.ping();
      const consumerHealth = getConsumerHealth();
      res.json({ 
        status: 'ok', 
        redis: 'connected',
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
      await redis.ping();
      checks.redis = { status: 'ok', latency: Date.now() - start };
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
      res.send(metrics);
    } catch (error) {
      res.status(500).send('Error collecting metrics');
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
  console.log('[Server] WebSocket server initialized');
  
  server.listen(port, async () => {
    console.log(`Server running on http://localhost:${port}/`);
    console.log(`tRPC endpoint available at http://localhost:${port}/api/trpc`);
    console.log(`WebSocket server available at ws://localhost:${port}/socket.io/`);
    console.log(`WebSocket API available at http://localhost:${port}/api/websocket`);
    console.log(`Health check available at http://localhost:${port}/health`);
    console.log(`Metrics available at http://localhost:${port}/metrics`);
    
    // Initialize Kafka topics
    try {
      await initializeTopics();
      console.log('[Server] Kafka topics initialized');
    } catch (error) {
      console.error('[Server] Failed to initialize Kafka topics:', error);
      console.warn('[Server] Continuing without Kafka');
    }
    
    // Start Kafka event consumers
    try {
      await startKafkaConsumers();
      console.log('[Server] Kafka event consumers started');
    } catch (error) {
      console.error('[Server] Failed to start Kafka event consumers:', error);
      console.warn('[Server] Continuing without Kafka event consumers');
    }
    
    // Start Dapr consumers
    try {
      await startAllConsumers();
      console.log('[Server] Dapr consumers started');
    } catch (error) {
      console.error('[Server] Failed to start Dapr consumers:', error);
      console.warn('[Server] Continuing without Dapr consumers');
    }
    
    // Start agricultural monitoring cron jobs
    try {
      initializeCronJobs();
      console.log('[Server] Agricultural monitoring cron jobs started');
    } catch (error) {
      console.error('[Server] Failed to start cron jobs:', error);
      console.warn('[Server] Continuing without cron jobs');
    }

        // Start SMS scheduler
        try {
          startSmsScheduler();
          console.log('[Server] SMS scheduler started');
        } catch (error) {
          console.error('[Server] Failed to start SMS scheduler:', error);
          console.warn('[Server] Continuing without SMS scheduler');
        }

        // Initialize Lakehouse for analytics and ML
        try {
          await initializeLakehouse();
          const lakehouseStatus = getLakehouseStatus();
          console.log('[Server] Lakehouse initialized:', lakehouseStatus);
        } catch (error) {
          console.error('[Server] Failed to initialize Lakehouse:', error);
          console.warn('[Server] Continuing without Lakehouse - analytics/ML features will be limited');
        }

        // Seed database with test data (only in development)
    // Commented out - use registration page to create users
    // if (process.env.NODE_ENV !== 'production') {
    //   try {
    //     await seedDatabase();
    //     console.log('[Server] Database seeded with test data');
    //   } catch (error) {
    //     console.error('[Server] Failed to seed database:', error);
    //     console.warn('[Server] Continuing without seed data');
    //   }
    // }
  });
  
    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('[Server] SIGTERM received, closing connections...');
      shutdownCronJobs();
      await stopKafkaConsumers();
      await stopAllConsumers();
      await shutdownLakehouse();
      await closeRedis();
      server.close(() => {
        console.log('[Server] Server closed');
        process.exit(0);
      });
    });
  
    process.on('SIGINT', async () => {
      console.log('[Server] SIGINT received, closing connections...');
      shutdownCronJobs();
      await stopKafkaConsumers();
      await stopAllConsumers();
      await shutdownLakehouse();
      await closeRedis();
      server.close(() => {
        console.log('[Server] Server closed');
        process.exit(0);
      });
    });
}

startServer().catch(console.error);
