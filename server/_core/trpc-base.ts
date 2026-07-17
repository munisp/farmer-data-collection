import { TRPCError } from "@trpc/server";
import { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { getDb } from "../db.js";
import { users, User } from "../../drizzle/schema.js";
import { verifyKeycloakToken, KeycloakUser } from "../keycloak.js";
import { rateLimit, RateLimitPresets } from "./redis-rate-limit.js";
import { router, middleware, baseProcedure } from "./trpc-init.js";
import type { Context, AuthenticatedContext } from "./trpc-init.js";
import { cacheMiddleware } from "../cache/trpc-cache-middleware.js";
import { mutationInvalidationMiddleware } from "../cache/mutation-invalidation-middleware.js";
import { logger } from '../logger.js';

// Re-export types and primitives from trpc-init so existing imports continue to work
export { router, middleware } from "./trpc-init.js";
export type { Context, AuthenticatedContext } from "./trpc-init.js";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  logger.error("[SECURITY] JWT_SECRET environment variable is REQUIRED. Generate with: openssl rand -base64 32");
}

// No demo users — all auth must go through real Keycloak or JWT+DB lookup

// Create context with token from Authorization header and Keycloak user
export const createContext = async ({ req }: CreateExpressContextOptions): Promise<Context> => {
  const token = req?.headers?.authorization?.replace("Bearer ", "") || null;
  
  // Try to verify Keycloak token first
  let keycloakUser: KeycloakUser | null = null;
  if (token) {
    keycloakUser = await verifyKeycloakToken(token);
  }
  
  return { token, keycloakUser };
};

// Global error-handling middleware: catches raw DB errors and converts to proper TRPCError
const dbErrorHandler = middleware(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    const msg = (error as Error)?.message ?? String(error);
    const isDbError = msg.includes("relation") || msg.includes("does not exist") ||
      msg.includes("ECONNREFUSED") || msg.includes("column") || msg.includes("no such table");
    if (isDbError) {
      logger.warn("[DB] Query failed", { error: msg });
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Service temporarily unavailable" });
    }
    throw error;
  }
});

// Public procedure with strict rate limiting(Redis or in-memory fallback) + cache + mutation invalidation
export const publicProcedure = baseProcedure
  .use(dbErrorHandler)
  .use(async ({ ctx, next }) => {
    const identifier = ctx.token || "anonymous";
    await rateLimit(identifier, RateLimitPresets.strict);
    return next();
  })
  .use(cacheMiddleware)
  .use(mutationInvalidationMiddleware);

// Protected procedure - requires authentication with moderate rate limiting (Redis or in-memory fallback) + cache
export const protectedProcedure = baseProcedure
  .use(dbErrorHandler)
  .use(async ({ ctx, next }) => {
    const identifier = ctx.token || "anonymous";
    await rateLimit(identifier, RateLimitPresets.moderate);
    return next();
  })
  .use(async ({ ctx, next }) => {
  // If user is already in context (for testing), use it
  if (ctx.user) {
    return next({ ctx: { ...ctx, user: ctx.user } as AuthenticatedContext });
  }

  // Try JWT token first
  if (ctx.token && !ctx.keycloakUser) {
    try {
      if (!JWT_SECRET) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "JWT_SECRET not configured" });
      const decoded = jwt.verify(ctx.token, JWT_SECRET) as { userId: number; email: string; role: string };
      const db = await getDb();
      if (db) {
        const user = await db.select().from(users).where(eq(users.id, decoded.userId)).limit(1);
        if (user.length > 0) {
          return next({
            ctx: {
              ...ctx,
              user: user[0],
            } as AuthenticatedContext,
          });
        }
      }

      // No demo user fallback — user must exist in DB
      logger.warn("[Auth] JWT valid but user not found in DB", { userId: decoded.userId });
    } catch (error) {
      // JWT verification failed, continue to check Keycloak
    }
  }

  // Check Keycloak user
  if (ctx.keycloakUser) {
    const db = await getDb();
    if (db) {
      const user = await db.select().from(users).where(eq(users.email, ctx.keycloakUser.email)).limit(1);
      if (user.length > 0) {
        return next({
          ctx: {
            ...ctx,
            user: user[0],
          } as AuthenticatedContext,
        });
      }
    }
  }

  throw new TRPCError({
    code: "UNAUTHORIZED",
    message: "Not authenticated",
  });
})
.use(cacheMiddleware)
.use(mutationInvalidationMiddleware);
