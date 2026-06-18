import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { TRPCError } from "@trpc/server";
import { requireDb } from "../utils/require-db.js";
import { users } from "../../drizzle/schema.js";
import { userSessions } from "../../drizzle/schema-honest-implementation.js";
import { eq, and, isNull } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { logger } from "../logger.js";
import { checkRateLimit, scanForThreats } from "../integrations/middleware-router-hooks.js";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY_SECONDS = parseInt(process.env.JWT_EXPIRY_SECONDS || "86400", 10);
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

function hashPassword(password: string, salt: string): string {
  return createHash("sha256").update(password + salt).digest("hex");
}

function generateSalt(): string {
  return randomBytes(16).toString("hex");
}

function verifyPassword(password: string, salt: string, hash: string): boolean {
  const candidate = createHash("sha256").update(password + salt).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(candidate), Buffer.from(hash));
  } catch {
    return false;
  }
}

export const authRouter = router({
  register: publicProcedure
    .input(z.object({
      email: z.string().email().max(255),
      password: z.string().min(8).max(128),
      firstName: z.string().min(1).max(100),
      lastName: z.string().min(1).max(100),
      phoneNumber: z.string().max(20).optional(),
      role: z.enum(["farmer", "buyer", "seller", "distributor", "extension_worker"]).default("farmer"),
    }))
    .mutation(async ({ input }) => {
      const rateCheck = await checkRateLimit("auth_register", input.email, 5, 3600);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many registration attempts" });

      const wafScan = await scanForThreats("auth_register", { email: input.email, firstName: input.firstName, lastName: input.lastName });
      if (!wafScan.safe) throw new TRPCError({ code: "FORBIDDEN", message: `Request blocked: ${wafScan.threats.join(", ")}` });

      const db = await requireDb();

      const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
      if (existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Email already registered" });
      }

      const salt = generateSalt();
      const passwordHash = hashPassword(input.password, salt);
      const storedPassword = `${salt}:${passwordHash}`;

      const [newUser] = await db.insert(users).values({
        email: input.email,
        password: storedPassword,
        firstName: input.firstName,
        lastName: input.lastName,
        phoneNumber: input.phoneNumber ?? null,
        role: input.role,
        isActive: true,
      }).returning();

      if (!JWT_SECRET) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "JWT not configured" });
      const token = jwt.sign(
        { userId: newUser.id, email: newUser.email, role: newUser.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY_SECONDS }
      );

      const refreshToken = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 86400000);

      await db.insert(userSessions).values({
        userId: newUser.id,
        sessionToken: refreshToken,
        expiresAt,
        ipAddress: "unknown",
        userAgent: "unknown",
      });

      logger.info("[Auth] User registered", { userId: newUser.id, email: newUser.email, role: newUser.role });

      return {
        user: { id: newUser.id, email: newUser.email, firstName: newUser.firstName, lastName: newUser.lastName, role: newUser.role },
        token,
        refreshToken,
        expiresIn: JWT_EXPIRY_SECONDS,
      };
    }),

  login: publicProcedure
    .input(z.object({
      email: z.string().email().max(255),
      password: z.string().min(1).max(128),
    }))
    .mutation(async ({ input }) => {
      const rateCheck = await checkRateLimit("auth_login", input.email, 10, 300);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many login attempts. Try again later." });

      const db = await requireDb();
      const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);

      if (!user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }

      if (!user.isActive) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Account is disabled" });
      }

      const parts = user.password.split(":");
      if (parts.length !== 2) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Invalid password format" });
      }

      const [salt, hash] = parts;
      if (!verifyPassword(input.password, salt, hash)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }

      if (!JWT_SECRET) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "JWT not configured" });
      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY_SECONDS }
      );

      const refreshToken = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 86400000);

      await db.insert(userSessions).values({
        userId: user.id,
        sessionToken: refreshToken,
        expiresAt,
        ipAddress: "unknown",
        userAgent: "unknown",
      });

      logger.info("[Auth] User logged in", { userId: user.id, email: user.email });

      return {
        user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
        token,
        refreshToken,
        expiresIn: JWT_EXPIRY_SECONDS,
      };
    }),

  refreshToken: publicProcedure
    .input(z.object({
      refreshToken: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [session] = await db.select().from(userSessions)
        .where(and(eq(userSessions.sessionToken, input.refreshToken), isNull(userSessions.revokedAt)))
        .limit(1);

      if (!session || new Date() > session.expiresAt) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired refresh token" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
      if (!user || !user.isActive) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found or disabled" });
      }

      // Rotate refresh token
      await db.update(userSessions).set({ revokedAt: new Date() }).where(eq(userSessions.id, session.id));

      if (!JWT_SECRET) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "JWT not configured" });
      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY_SECONDS }
      );

      const newRefreshToken = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 86400000);

      await db.insert(userSessions).values({
        userId: user.id,
        sessionToken: newRefreshToken,
        expiresAt,
        ipAddress: "unknown",
        userAgent: "unknown",
      });

      return { token, refreshToken: newRefreshToken, expiresIn: JWT_EXPIRY_SECONDS };
    }),

  logout: protectedProcedure
    .input(z.object({
      refreshToken: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.update(userSessions).set({ revokedAt: new Date() }).where(eq(userSessions.sessionToken, input.refreshToken));
      return { success: true };
    }),

  me: protectedProcedure
    .query(async ({ ctx }) => {
      return {
        id: ctx.user.id,
        email: ctx.user.email,
        firstName: ctx.user.firstName,
        lastName: ctx.user.lastName,
        role: ctx.user.role,
      };
    }),
});
