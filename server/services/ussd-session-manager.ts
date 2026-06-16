/**
 * USSD Session Manager
 * 
 * Provides robust session management for USSD with:
 * - Session TTL and automatic expiry
 * - Idempotent confirmation handling
 * - Session cleanup cron job
 * - Metrics and monitoring
 * - Concurrency protection
 */

import { getDb } from "../db.js";
import { messagingSessions } from "../../drizzle/schema.js";
import { eq, lt, and, sql } from "drizzle-orm";
import { Redis } from "ioredis";
import crypto from "crypto";
import { logger } from '../logger.js';

// Session configuration
export const SESSION_CONFIG = {
  ttlSeconds: 180, // 3 minutes (standard USSD session timeout)
  maxIdleSeconds: 60, // 1 minute idle timeout
  cleanupIntervalMs: 30000, // 30 seconds
  lockTimeoutMs: 5000, // 5 seconds for distributed lock
};

// Session state
export interface USSDSession {
  sessionId: string;
  phoneNumber: string;
  step: string;
  data: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  isCompleted: boolean;
  completedAction?: string;
}

// Idempotency record
export interface IdempotencyRecord {
  key: string;
  sessionId: string;
  action: string;
  result: any;
  createdAt: number;
  expiresAt: number;
}

// Session metrics
export interface SessionMetrics {
  activeSessions: number;
  completedSessions: number;
  expiredSessions: number;
  avgSessionDurationMs: number;
  dropOffRates: Record<string, number>;
  stepCompletionRates: Record<string, number>;
}

export class USSDSessionManager {
  private redis: Redis;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private metrics: SessionMetrics = {
    activeSessions: 0,
    completedSessions: 0,
    expiredSessions: 0,
    avgSessionDurationMs: 0,
    dropOffRates: {},
    stepCompletionRates: {},
  };

  // Redis keys
  private readonly KEYS = {
    session: (id: string) => `ussd:session:${id}`,
    idempotency: (key: string) => `ussd:idempotency:${key}`,
    lock: (id: string) => `ussd:lock:${id}`,
    metrics: "ussd:metrics",
    stepCounts: "ussd:step_counts",
    completionCounts: "ussd:completion_counts",
  };

  constructor(redisUrl?: string) {
    this.redis = new Redis(redisUrl || process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });

    this.redis.on("error", (err) => {
      logger.error("[USSDSessionManager] Redis error:", err);
    });

    this.redis.on("connect", () => {
      logger.info("[USSDSessionManager] Redis connected");
    });
  }

  /**
   * Get or create session with TTL
   */
  async getOrCreateSession(
    sessionId: string,
    phoneNumber: string,
    initialStep: string = "MAIN_MENU"
  ): Promise<USSDSession> {
    // Try to get existing session
    const existing = await this.getSession(sessionId);
    if (existing) {
      // Check if expired
      if (existing.expiresAt < Date.now()) {
        await this.expireSession(sessionId);
        // Create new session
        return this.createSession(sessionId, phoneNumber, initialStep);
      }
      // Refresh TTL
      await this.refreshSession(sessionId);
      return existing;
    }

    // Create new session
    return this.createSession(sessionId, phoneNumber, initialStep);
  }

  /**
   * Create new session
   */
  async createSession(
    sessionId: string,
    phoneNumber: string,
    step: string,
    data: Record<string, unknown> = {}
  ): Promise<USSDSession> {
    const now = Date.now();
    const session: USSDSession = {
      sessionId,
      phoneNumber,
      step,
      data,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + SESSION_CONFIG.ttlSeconds * 1000,
      isCompleted: false,
    };

    await this.redis.setex(
      this.KEYS.session(sessionId),
      SESSION_CONFIG.ttlSeconds,
      JSON.stringify(session)
    );

    // Track metrics
    await this.redis.hincrby(this.KEYS.stepCounts, step, 1);
    await this.redis.hincrby(this.KEYS.metrics, "total_sessions", 1);

    logger.info(`[USSDSessionManager] Session created: ${sessionId} (phone: ${phoneNumber})`);
    return session;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<USSDSession | null> {
    const data = await this.redis.get(this.KEYS.session(sessionId));
    if (!data) return null;

    const session: USSDSession = JSON.parse(data);
    return session;
  }

  /**
   * Update session with concurrency protection
   */
  async updateSession(
    sessionId: string,
    updates: Partial<Pick<USSDSession, "step" | "data" | "isCompleted" | "completedAction">>
  ): Promise<USSDSession | null> {
    // Acquire distributed lock
    const lockKey = this.KEYS.lock(sessionId);
    const lockValue = crypto.randomUUID();
    const lockAcquired = await this.redis.set(
      lockKey,
      lockValue,
      "PX",
      SESSION_CONFIG.lockTimeoutMs,
      "NX"
    );

    if (!lockAcquired) {
      logger.warn(`[USSDSessionManager] Failed to acquire lock for session: ${sessionId}`);
      // Wait and retry once
      await new Promise((resolve) => setTimeout(resolve, 100));
      const retryLock = await this.redis.set(
        lockKey,
        lockValue,
        "PX",
        SESSION_CONFIG.lockTimeoutMs,
        "NX"
      );
      if (!retryLock) {
        throw new Error("Session update conflict - please try again");
      }
    }

    try {
      const session = await this.getSession(sessionId);
      if (!session) return null;

      const previousStep = session.step;
      const now = Date.now();

      // Apply updates
      if (updates.step !== undefined) session.step = updates.step;
      if (updates.data !== undefined) session.data = { ...session.data, ...updates.data };
      if (updates.isCompleted !== undefined) session.isCompleted = updates.isCompleted;
      if (updates.completedAction !== undefined) session.completedAction = updates.completedAction;

      session.updatedAt = now;
      session.expiresAt = now + SESSION_CONFIG.ttlSeconds * 1000;

      await this.redis.setex(
        this.KEYS.session(sessionId),
        SESSION_CONFIG.ttlSeconds,
        JSON.stringify(session)
      );

      // Track step transition
      if (updates.step && updates.step !== previousStep) {
        await this.redis.hincrby(this.KEYS.stepCounts, updates.step, 1);
        await this.redis.hincrby(this.KEYS.completionCounts, previousStep, 1);
      }

      // Track completion
      if (updates.isCompleted) {
        await this.redis.hincrby(this.KEYS.metrics, "completed_sessions", 1);
        const duration = now - session.createdAt;
        await this.redis.hincrbyfloat(this.KEYS.metrics, "total_duration", duration);
      }

      return session;
    } finally {
      // Release lock (only if we still own it)
      const currentLock = await this.redis.get(lockKey);
      if (currentLock === lockValue) {
        await this.redis.del(lockKey);
      }
    }
  }

  /**
   * Refresh session TTL
   */
  async refreshSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (session) {
      session.expiresAt = Date.now() + SESSION_CONFIG.ttlSeconds * 1000;
      session.updatedAt = Date.now();
      await this.redis.setex(
        this.KEYS.session(sessionId),
        SESSION_CONFIG.ttlSeconds,
        JSON.stringify(session)
      );
    }
  }

  /**
   * Expire session
   */
  async expireSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (session && !session.isCompleted) {
      // Track drop-off
      await this.redis.hincrby(this.KEYS.metrics, "expired_sessions", 1);
      await this.redis.hincrby(`ussd:dropoff:${session.step}`, "count", 1);
    }
    await this.redis.del(this.KEYS.session(sessionId));
    logger.info(`[USSDSessionManager] Session expired: ${sessionId}`);
  }

  /**
   * Check idempotency for action
   */
  async checkIdempotency(
    sessionId: string,
    action: string,
    params: Record<string, unknown>
  ): Promise<{ isDuplicate: boolean; previousResult?: any }> {
    const key = this.generateIdempotencyKey(sessionId, action, params);
    const existing = await this.redis.get(this.KEYS.idempotency(key));

    if (existing) {
      const record: IdempotencyRecord = JSON.parse(existing);
      logger.info(`[USSDSessionManager] Duplicate action detected: ${action} for session ${sessionId}`);
      return { isDuplicate: true, previousResult: record.result };
    }

    return { isDuplicate: false };
  }

  /**
   * Record idempotency for action
   */
  async recordIdempotency(
    sessionId: string,
    action: string,
    params: Record<string, unknown>,
    result: any
  ): Promise<void> {
    const key = this.generateIdempotencyKey(sessionId, action, params);
    const record: IdempotencyRecord = {
      key,
      sessionId,
      action,
      result,
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000, // 1 hour
    };

    await this.redis.setex(
      this.KEYS.idempotency(key),
      3600, // 1 hour TTL
      JSON.stringify(record)
    );
  }

  /**
   * Execute action with idempotency
   */
  async executeWithIdempotency<T>(
    sessionId: string,
    action: string,
    params: Record<string, unknown>,
    executor: () => Promise<T>
  ): Promise<T> {
    // Check for duplicate
    const { isDuplicate, previousResult } = await this.checkIdempotency(sessionId, action, params);
    if (isDuplicate) {
      return previousResult as T;
    }

    // Execute action
    const result = await executor();

    // Record for idempotency
    await this.recordIdempotency(sessionId, action, params, result);

    return result;
  }

  /**
   * Generate idempotency key
   */
  private generateIdempotencyKey(sessionId: string, action: string, params: Record<string, unknown>): string {
    const data = JSON.stringify({ sessionId, action, params });
    return crypto.createHash("sha256").update(data).digest("hex").substring(0, 32);
  }

  /**
   * Start cleanup cron job
   */
  startCleanupJob(): void {
    if (this.cleanupInterval) return;

    logger.info("[USSDSessionManager] Starting cleanup job");
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupExpiredSessions();
    }, SESSION_CONFIG.cleanupIntervalMs);
  }

  /**
   * Stop cleanup cron job
   */
  stopCleanupJob(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info("[USSDSessionManager] Cleanup job stopped");
    }
  }

  /**
   * Cleanup expired sessions from database
   */
  async cleanupExpiredSessions(): Promise<number> {
    const db = await getDb();
    if (!db) return 0;

    try {
      const expiryTime = new Date(Date.now() - SESSION_CONFIG.ttlSeconds * 1000);

      // Delete expired sessions from database
      const result = await db
        .delete(messagingSessions)
        .where(
          and(
            lt(messagingSessions.lastActivity, expiryTime),
            lt(messagingSessions.expiresAt, new Date())
          )
        )
        .returning({ id: messagingSessions.id });

      const count = result.length;
      if (count > 0) {
        logger.info(`[USSDSessionManager] Cleaned up ${count} expired sessions from database`);
        await this.redis.hincrby(this.KEYS.metrics, "cleaned_sessions", count);
      }

      return count;
    } catch (error) {
      logger.error("[USSDSessionManager] Cleanup error:", error);
      return 0;
    }
  }

  /**
   * Get session metrics
   */
  async getMetrics(): Promise<SessionMetrics> {
    const metrics = await this.redis.hgetall(this.KEYS.metrics);
    const stepCounts = await this.redis.hgetall(this.KEYS.stepCounts);
    const completionCounts = await this.redis.hgetall(this.KEYS.completionCounts);

    const totalSessions = parseInt(metrics.total_sessions || "0", 10);
    const completedSessions = parseInt(metrics.completed_sessions || "0", 10);
    const expiredSessions = parseInt(metrics.expired_sessions || "0", 10);
    const totalDuration = parseFloat(metrics.total_duration || "0");

    // Calculate drop-off rates
    const dropOffRates: Record<string, number> = {};
    for (const [step, count] of Object.entries(stepCounts)) {
      const started = parseInt(count, 10);
      const completed = parseInt(completionCounts[step] || "0", 10);
      dropOffRates[step] = started > 0 ? ((started - completed) / started) * 100 : 0;
    }

    // Calculate step completion rates
    const stepCompletionRates: Record<string, number> = {};
    for (const [step, count] of Object.entries(stepCounts)) {
      const started = parseInt(count, 10);
      const completed = parseInt(completionCounts[step] || "0", 10);
      stepCompletionRates[step] = started > 0 ? (completed / started) * 100 : 0;
    }

    return {
      activeSessions: totalSessions - completedSessions - expiredSessions,
      completedSessions,
      expiredSessions,
      avgSessionDurationMs: completedSessions > 0 ? totalDuration / completedSessions : 0,
      dropOffRates,
      stepCompletionRates,
    };
  }

  /**
   * Get drop-off analytics
   */
  async getDropOffAnalytics(): Promise<{
    byStep: Record<string, { started: number; completed: number; dropOffRate: number }>;
    overallCompletionRate: number;
    avgStepsPerSession: number;
  }> {
    const stepCounts = await this.redis.hgetall(this.KEYS.stepCounts);
    const completionCounts = await this.redis.hgetall(this.KEYS.completionCounts);
    const metrics = await this.redis.hgetall(this.KEYS.metrics);

    const byStep: Record<string, { started: number; completed: number; dropOffRate: number }> = {};
    let totalSteps = 0;

    for (const [step, count] of Object.entries(stepCounts)) {
      const started = parseInt(count, 10);
      const completed = parseInt(completionCounts[step] || "0", 10);
      totalSteps += started;
      byStep[step] = {
        started,
        completed,
        dropOffRate: started > 0 ? ((started - completed) / started) * 100 : 0,
      };
    }

    const totalSessions = parseInt(metrics.total_sessions || "0", 10);
    const completedSessions = parseInt(metrics.completed_sessions || "0", 10);

    return {
      byStep,
      overallCompletionRate: totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0,
      avgStepsPerSession: totalSessions > 0 ? totalSteps / totalSessions : 0,
    };
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    this.stopCleanupJob();
    await this.redis.quit();
  }
}

// Singleton instance
let sessionManagerInstance: USSDSessionManager | null = null;

export function getUSSDSessionManager(): USSDSessionManager {
  if (!sessionManagerInstance) {
    sessionManagerInstance = new USSDSessionManager();
  }
  return sessionManagerInstance;
}

export default USSDSessionManager;
