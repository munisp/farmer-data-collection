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

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  logger.error("[SECURITY] JWT_SECRET environment variable is not set. Using temporary development key.");
  return "dev-only-secret-do-not-use-in-production";
})();

const demoUsers = [
  {
    id: 900001,
    email: "demo@farmer.com",
    firstName: "Demo",
    lastName: "Farmer",
    role: "farmer",
    isActive: true,
  },
  {
    id: 900002,
    email: "buyer@agrifinance.com",
    firstName: "Demo",
    lastName: "Buyer",
    role: "buyer",
    isActive: true,
  },
  {
    id: 900003,
    email: "seller@agrifinance.com",
    firstName: "Demo",
    lastName: "Seller",
    role: "seller",
    isActive: true,
  },
] as const;

function getDemoUserFromToken(decoded: { userId: number; email: string; role: string }): User | null {
  const demoUser = demoUsers.find(
    (user) => user.id === decoded.userId && user.email === decoded.email && user.role === decoded.role && user.isActive
  );

  if (!demoUser) {
    return null;
  }

  return {
    id: demoUser.id,
    email: demoUser.email,
    firstName: demoUser.firstName,
    lastName: demoUser.lastName,
    role: demoUser.role as User["role"],
    isActive: true,
  } as User;
}

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

// Public procedure with strict rate limiting(Redis or in-memory fallback) + cache + mutation invalidation
export const publicProcedure = baseProcedure
  .use(async ({ ctx, next }) => {
    const identifier = ctx.token || "anonymous";
    await rateLimit(identifier, RateLimitPresets.strict);
    return next();
  })
  .use(cacheMiddleware)
  .use(mutationInvalidationMiddleware);

// Protected procedure - requires authentication with moderate rate limiting (Redis or in-memory fallback) + cache
export const protectedProcedure = baseProcedure
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

      const demoUser = getDemoUserFromToken(decoded);
      if (demoUser) {
        return next({
          ctx: {
            ...ctx,
            user: demoUser,
          } as AuthenticatedContext,
        });
      }
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
