import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { router, publicProcedure } from "./_core/trpc-base.js";
import { getDb } from "./db.js";
import { users } from "../drizzle/schema.js";
import { logger } from './logger.js';

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  logger.error("[SECURITY] JWT_SECRET environment variable is not set. Using temporary development key.");
  return "dev-only-secret-do-not-use-in-production";
})();

// Input validation schemas
const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const demoUsers = [
  {
    id: 900001,
    email: "demo@farmer.com",
    password: "demo123",
    firstName: "Demo",
    lastName: "Farmer",
    role: "farmer",
    isActive: true,
  },
  {
    id: 900002,
    email: "buyer@agrifinance.com",
    password: "demo123",
    firstName: "Demo",
    lastName: "Buyer",
    role: "buyer",
    isActive: true,
  },
  {
    id: 900003,
    email: "seller@agrifinance.com",
    password: "demo123",
    firstName: "Demo",
    lastName: "Seller",
    role: "seller",
    isActive: true,
  },
] as const;

function findDemoUserByEmail(email: string) {
  return demoUsers.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;
}

function isInfrastructureError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /failed query|database|connect|ECONNREFUSED|does not exist/i.test(message);
}

function buildAuthResponse(user: {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
}) {
  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  return {
    success: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
  };
}

function getDemoAuthResult(email: string, password: string) {
  const demoUser = findDemoUserByEmail(email);
  if (!demoUser || demoUser.password !== password || !demoUser.isActive) {
    return null;
  }

  return buildAuthResponse({
    id: demoUser.id,
    email: demoUser.email,
    firstName: demoUser.firstName,
    lastName: demoUser.lastName,
    role: demoUser.role,
  });
}

function getDemoUserFromToken(decoded: { userId: number; email: string; role: string }) {
  const demoUser = findDemoUserByEmail(decoded.email);
  if (!demoUser || demoUser.id !== decoded.userId || demoUser.role !== decoded.role || !demoUser.isActive) {
    return null;
  }

  return {
    id: demoUser.id,
    email: demoUser.email,
    firstName: demoUser.firstName,
    lastName: demoUser.lastName,
    role: demoUser.role,
  };
}

export const authRouter = router({
  // Register new user
  register: publicProcedure
    .input(registerSchema)
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new Error("Database connection not available");
      }

      // Check if user already exists
      const existingUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email));

      if (existingUsers.length > 0) {
        throw new Error("User with this email already exists");
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(input.password, 10);

      // Create user
      const [newUser] = await db
        .insert(users)
        .values({
          email: input.email,
          password: hashedPassword,
          firstName: input.firstName,
          lastName: input.lastName,
          role: "farmer",
          isActive: true,
        })
        .returning({ id: users.id });

      // Generate JWT token
      const token = jwt.sign(
        {
          userId: newUser.id,
          email: input.email,
          role: "farmer",
        },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      return {
        success: true,
        token,
        user: {
          id: newUser.id,
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          role: "farmer",
        },
      };
    }),

  // Login existing user
  login: publicProcedure
    .input(loginSchema)
    .mutation(async ({ input }) => {
      try {
        const db = await getDb();
        if (!db) {
          const demoResult = getDemoAuthResult(input.email, input.password);
          if (demoResult) return demoResult;
          throw new Error("Database connection not available");
        }

        const foundUsers = await db
          .select({
            id: users.id,
            email: users.email,
            password: users.password,
            firstName: users.firstName,
            lastName: users.lastName,
            role: users.role,
            isActive: users.isActive,
          })
          .from(users)
          .where(eq(users.email, input.email));

        if (foundUsers.length === 0) {
          const demoResult = getDemoAuthResult(input.email, input.password);
          if (demoResult) return demoResult;
          throw new Error("Invalid email or password");
        }

        const user = foundUsers[0];

        if (!user.isActive) {
          throw new Error("Account is inactive");
        }

        const isPasswordValid = await bcrypt.compare(input.password, user.password);
        if (!isPasswordValid) {
          const demoResult = getDemoAuthResult(input.email, input.password);
          if (demoResult) return demoResult;
          throw new Error("Invalid email or password");
        }

        return buildAuthResponse({
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        });
      } catch (error) {
        if (isInfrastructureError(error)) {
          const demoResult = getDemoAuthResult(input.email, input.password);
          if (demoResult) return demoResult;
        }
        throw error;
      }
    }),

  // Get current user profile
  me: publicProcedure.query(async ({ ctx }) => {
    const token = ctx.token;
    if (!token) {
      return null;
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; email: string; role: string };
      try {
        const db = await getDb();
        if (!db) {
          return getDemoUserFromToken(decoded);
        }

        const foundUsers = await db
          .select({
            id: users.id,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
            role: users.role,
            isActive: users.isActive,
          })
          .from(users)
          .where(eq(users.id, decoded.userId));

        if (foundUsers.length === 0 || !foundUsers[0].isActive) {
          return getDemoUserFromToken(decoded);
        }

        const user = foundUsers[0];
        return {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        };
      } catch (error) {
        if (isInfrastructureError(error)) {
          return getDemoUserFromToken(decoded);
        }
        throw error;
      }
    } catch (error) {
      logger.error("[Auth.me] Error:", error);
      return null;
    }
  }),
});
