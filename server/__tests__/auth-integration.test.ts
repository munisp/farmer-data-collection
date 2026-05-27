import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "../trpc";
import { createContext } from "../_core/trpc-base";
import type { Context } from "../_core/trpc-base";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

describe("Authentication Integration Tests", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  let ctx: Context;
  let testUserId: number;
  const testEmail = `test-${Date.now()}@example.com`;
  const testPassword = "TestPassword123!";

  beforeAll(async () => {
    // Create a test context
    ctx = await createContext({
      req: {
        headers: {},
      } as any,
      res: {} as any,
    });
    caller = appRouter.createCaller(ctx);
  });

  afterAll(async () => {
    // Clean up test user
    if (testUserId) {
      const db = await getDb();
      if (db) {
        await db.delete(users).where(eq(users.id, testUserId));
      }
    }
  });

  describe("User Registration", () => {
    it("should successfully register a new user", async () => {
      const result = await caller.auth.register({
        email: testEmail,
        password: testPassword,
        firstName: "Test",
        lastName: "User",
      });

      expect(result).toHaveProperty("token");
      expect(result).toHaveProperty("user");
      expect(result.user.email).toBe(testEmail);
      expect(result.user.firstName).toBe("Test");
      expect(result.user.lastName).toBe("User");
      
      testUserId = result.user.id;
    });

    it("should not allow duplicate email registration", async () => {
      await expect(
        caller.auth.register({
          email: testEmail,
          password: testPassword,
          firstName: "Duplicate",
          lastName: "User",
        })
      ).rejects.toThrow();
    });

    it("should validate email format", async () => {
      await expect(
        caller.auth.register({
          email: "invalid-email",
          password: testPassword,
          firstName: "Test",
          lastName: "User",
        })
      ).rejects.toThrow();
    });

    it("should validate password strength", async () => {
      await expect(
        caller.auth.register({
          email: `test2-${Date.now()}@example.com`,
          password: "weak",
          firstName: "Test",
          lastName: "User",
        })
      ).rejects.toThrow();
    });
  });

  describe("User Login", () => {
    it("should successfully login with correct credentials", async () => {
      const result = await caller.auth.login({
        email: testEmail,
        password: testPassword,
      });

      expect(result).toHaveProperty("token");
      expect(result).toHaveProperty("user");
      expect(result.user.email).toBe(testEmail);
    });

    it("should reject login with incorrect password", async () => {
      await expect(
        caller.auth.login({
          email: testEmail,
          password: "WrongPassword123!",
        })
      ).rejects.toThrow();
    });

    it("should reject login with non-existent email", async () => {
      await expect(
        caller.auth.login({
          email: "nonexistent@example.com",
          password: testPassword,
        })
      ).rejects.toThrow();
    });
  });

  describe("Token Verification", () => {
    let validToken: string;

    beforeAll(async () => {
      const result = await caller.auth.login({
        email: testEmail,
        password: testPassword,
      });
      validToken = result.token;
    });

    it("should verify valid token and return user data", async () => {
      // Create context with valid token
      const authedCtx = await createContext({
        req: {
          headers: {
            authorization: `Bearer ${validToken}`,
          },
        } as any,
        res: {} as any,
      });
      const authedCaller = appRouter.createCaller(authedCtx);

      const result = await authedCaller.auth.me();

      expect(result).not.toBeNull();
      expect(result?.email).toBe(testEmail);
      expect(result?.id).toBe(testUserId);
    });

    it("should return null for invalid token", async () => {
      const invalidCtx = await createContext({
        req: {
          headers: {
            authorization: "Bearer invalid-token",
          },
        } as any,
        res: {} as any,
      });
      const invalidCaller = appRouter.createCaller(invalidCtx);

      const result = await invalidCaller.auth.me();

      expect(result).toBeNull();
    });

    it("should return null when no token provided", async () => {
      const result = await caller.auth.me();

      expect(result).toBeNull();
    });
  });

  describe("User Data Isolation", () => {
    let user1Token: string;
    let user2Token: string;
    let user1Id: number;
    let user2Id: number;

    beforeAll(async () => {
      // Create two test users
      const user1 = await caller.auth.register({
        email: `user1-${Date.now()}@example.com`,
        password: testPassword,
        firstName: "User",
        lastName: "One",
      });
      user1Token = user1.token;
      user1Id = user1.user.id;

      const user2 = await caller.auth.register({
        email: `user2-${Date.now()}@example.com`,
        password: testPassword,
        firstName: "User",
        lastName: "Two",
      });
      user2Token = user2.token;
      user2Id = user2.user.id;
    });

    afterAll(async () => {
      // Clean up test users
      const db = await getDb();
      if (db) {
        await db.delete(users).where(eq(users.id, user1Id));
        await db.delete(users).where(eq(users.id, user2Id));
      }
    });

    it("should isolate user data between different users", async () => {
      const user1Ctx = await createContext({
        req: {
          headers: {
            authorization: `Bearer ${user1Token}`,
          },
        } as any,
        res: {} as any,
      });
      const user1Caller = appRouter.createCaller(user1Ctx);

      const user2Ctx = await createContext({
        req: {
          headers: {
            authorization: `Bearer ${user2Token}`,
          },
        } as any,
        res: {} as any,
      });
      const user2Caller = appRouter.createCaller(user2Ctx);

      const user1Data = await user1Caller.auth.me();
      const user2Data = await user2Caller.auth.me();

      expect(user1Data?.id).toBe(user1Id);
      expect(user2Data?.id).toBe(user2Id);
      expect(user1Data?.id).not.toBe(user2Data?.id);
    });
  });

  describe("Security", () => {
    it("should not return password hash in user data", async () => {
      const result = await caller.auth.login({
        email: testEmail,
        password: testPassword,
      });

      expect(result.user).not.toHaveProperty("passwordHash");
      expect(result.user).not.toHaveProperty("password");
    });

    it("should hash passwords before storing", async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, testUserId))
        .limit(1);

      expect(user.password).not.toBe(testPassword);
      // bcrypt hash prefix ($2a$ or $2b$ are both valid)
      expect(user.password).toMatch(/^\$2[ab]\$/);
    });
  });
});
