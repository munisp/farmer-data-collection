import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { appRouter, createContext } from '../trpc';
import { getDb } from '../db';
import * as schema from '../../drizzle/schema';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

describe('Authentication', () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  let testEmail: string;

  beforeAll(async () => {
    db = await getDb();
    if (!db) {
      console.warn('⏭️  Database not available — skipping DB-dependent tests'); return;
    }
  });

  beforeEach(() => {
    // Generate unique email for each test
    testEmail = `authtest_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
  });

  afterAll(async () => {
    // Clean up test users
    if (db) {
      await db.delete(schema.users).where(eq(schema.users.email, testEmail));
    }
  });

  describe('User Registration', () => {
    it('should register a new user with valid credentials', async () => {
      const caller = appRouter.createCaller(await createContext({ req: {} as any, res: {} as any }));

      const result = await caller.auth.register({
        email: testEmail,
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.token).toBeTypeOf('string');
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe(testEmail);
      expect(result.user.firstName).toBe('John');
      expect(result.user.lastName).toBe('Doe');
      expect(result.user.role).toBe('farmer');
      expect(result.user.id).toBeTypeOf('number');

      // Verify user was created in database
      const [createdUser] = await db!
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, testEmail))
        .limit(1);

      expect(createdUser).toBeDefined();
      expect(createdUser.email).toBe(testEmail);
      expect(createdUser.isActive).toBe(true);

      // Clean up
      await db!.delete(schema.users).where(eq(schema.users.id, result.user.id));
    });

    it('should fail to register with duplicate email', async () => {
      const caller = appRouter.createCaller(await createContext({ req: {} as any, res: {} as any }));

      // Register first user
      const firstResult = await caller.auth.register({
        email: testEmail,
        password: 'password123',
        firstName: 'First',
        lastName: 'User',
      });

      expect(firstResult.success).toBe(true);

      // Try to register with same email
      await expect(
        caller.auth.register({
          email: testEmail,
          password: 'differentpassword',
          firstName: 'Second',
          lastName: 'User',
        })
      ).rejects.toThrow('User with this email already exists');

      // Clean up
      await db!.delete(schema.users).where(eq(schema.users.id, firstResult.user.id));
    });

    it('should fail to register with invalid email format', async () => {
      const caller = appRouter.createCaller(await createContext({ req: {} as any, res: {} as any }));

      await expect(
        caller.auth.register({
          email: 'invalid-email',
          password: 'password123',
          firstName: 'Test',
          lastName: 'User',
        })
      ).rejects.toThrow();
    });

    it('should fail to register with short password', async () => {
      const caller = appRouter.createCaller(await createContext({ req: {} as any, res: {} as any }));

      await expect(
        caller.auth.register({
          email: testEmail,
          password: '12345', // Less than 6 characters
          firstName: 'Test',
          lastName: 'User',
        })
      ).rejects.toThrow();
    });

    it('should fail to register without first name', async () => {
      const caller = appRouter.createCaller(await createContext({ req: {} as any, res: {} as any }));

      await expect(
        caller.auth.register({
          email: testEmail,
          password: 'password123',
          firstName: '',
          lastName: 'User',
        })
      ).rejects.toThrow();
    });

    it('should fail to register without last name', async () => {
      const caller = appRouter.createCaller(await createContext({ req: {} as any, res: {} as any }));

      await expect(
        caller.auth.register({
          email: testEmail,
          password: 'password123',
          firstName: 'Test',
          lastName: '',
        })
      ).rejects.toThrow();
    });

    it('should hash password before storing', async () => {
      const caller = appRouter.createCaller(await createContext({ req: {} as any, res: {} as any }));
      const plainPassword = 'mySecurePassword123';

      const result = await caller.auth.register({
        email: testEmail,
        password: plainPassword,
        firstName: 'Password',
        lastName: 'Test',
      });

      // Get user from database
      const [user] = await db!
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, result.user.id))
        .limit(1);

      // Password should be hashed, not plain text
      expect(user.password).not.toBe(plainPassword);
      // bcrypt hash prefix ($2a$ or $2b$ are both valid)
      expect(user.password).toMatch(/^\$2[ab]\$/);

      // Clean up
      await db!.delete(schema.users).where(eq(schema.users.id, result.user.id));
    });
  });

  describe('User Login', () => {
    let registeredUserId: number;
    let loginEmail: string;
    const loginPassword = 'loginPassword123';

    beforeEach(async () => {
      // Register a user for login tests with unique email
      loginEmail = `login_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
      const caller = appRouter.createCaller(await createContext({ req: {} as any, res: {} as any }));
      const result = await caller.auth.register({
        email: loginEmail,
        password: loginPassword,
        firstName: 'Login',
        lastName: 'Test',
      });
      registeredUserId = result.user.id;
    });

    afterEach(async () => {
      // Clean up registered user after each test
      if (db && registeredUserId) {
        await db.delete(schema.users).where(eq(schema.users.id, registeredUserId));
      }
    });

    it('should login with correct credentials', async () => {
      const caller = appRouter.createCaller(await createContext({ req: {} as any, res: {} as any }));

      const result = await caller.auth.login({
        email: loginEmail,
        password: loginPassword,
      });

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.token).toBeTypeOf('string');
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe(loginEmail);
      expect(result.user.firstName).toBe('Login');
      expect(result.user.lastName).toBe('Test');
    });

    it('should fail to login with incorrect password', async () => {
      const caller = appRouter.createCaller(await createContext({ req: {} as any, res: {} as any }));

      await expect(
        caller.auth.login({
          email: loginEmail,
          password: 'wrongPassword',
        })
      ).rejects.toThrow('Invalid email or password');
    });

    it('should fail to login with non-existent email', async () => {
      const caller = appRouter.createCaller(await createContext({ req: {} as any, res: {} as any }));

      await expect(
        caller.auth.login({
          email: 'nonexistent@example.com',
          password: 'anyPassword',
        })
      ).rejects.toThrow('Invalid email or password');
    });

    it('should fail to login with invalid email format', async () => {
      const caller = appRouter.createCaller(await createContext({ req: {} as any, res: {} as any }));

      await expect(
        caller.auth.login({
          email: 'invalid-email',
          password: 'anyPassword',
        })
      ).rejects.toThrow();
    });

    it('should fail to login with empty password', async () => {
      const caller = appRouter.createCaller(await createContext({ req: {} as any, res: {} as any }));

      await expect(
        caller.auth.login({
          email: loginEmail,
          password: '',
        })
      ).rejects.toThrow();
    });

    it('should return valid JWT token on successful login', async () => {
      const caller = appRouter.createCaller(await createContext({ req: {} as any, res: {} as any }));

      const result = await caller.auth.login({
        email: loginEmail,
        password: loginPassword,
      });

      // Verify token can be decoded
      const decoded = jwt.verify(result.token, JWT_SECRET) as any;
      expect(decoded.userId).toBe(registeredUserId);
      expect(decoded.email).toBe(loginEmail);
      expect(decoded.role).toBe('farmer');
    });

    it('should fail to login with inactive user account', async () => {
      // Deactivate the user
      await db!
        .update(schema.users)
        .set({ isActive: false })
        .where(eq(schema.users.id, registeredUserId));

      const caller = appRouter.createCaller(await createContext({ req: {} as any, res: {} as any }));

      await expect(
        caller.auth.login({
          email: loginEmail,
          password: loginPassword,
        })
      ).rejects.toThrow('Account is inactive');

      // Reactivate for cleanup
      await db!
        .update(schema.users)
        .set({ isActive: true })
        .where(eq(schema.users.id, registeredUserId));
    });
  });

  describe('Get Current User (me)', () => {
    let testUserId: number;
    let testToken: string;
    let meEmail: string;

    beforeEach(async () => {
      // Register and login a user with unique email
      meEmail = `me_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
      const caller = appRouter.createCaller(await createContext({ req: {} as any, res: {} as any }));
      const registerResult = await caller.auth.register({
        email: meEmail,
        password: 'mePassword123',
        firstName: 'Me',
        lastName: 'Test',
      });
      testUserId = registerResult.user.id;
      testToken = registerResult.token;
    });

    afterEach(async () => {
      // Clean up test user after each test
      if (db && testUserId) {
        await db.delete(schema.users).where(eq(schema.users.id, testUserId));
      }
    });

    it('should return current user with valid token', async () => {
      const caller = appRouter.createCaller(await createContext({ req: {} as any, res: {} as any }));

      const user = await caller.auth.me({
        token: testToken,
      });

      expect(user).toBeDefined();
      expect(user?.id).toBe(testUserId);
      expect(user?.email).toBe(meEmail);
      expect(user?.firstName).toBe('Me');
      expect(user?.lastName).toBe('Test');
      expect(user?.role).toBe('farmer');
    });

    it('should return null with invalid token', async () => {
      const caller = appRouter.createCaller(await createContext({ req: {} as any, res: {} as any }));

      const user = await caller.auth.me({
        token: 'invalid.token.here',
      });

      expect(user).toBeNull();
    });

    it('should return null with expired token', async () => {
      // Create an expired token
      const expiredToken = jwt.sign(
        {
          userId: testUserId,
          email: meEmail,
          role: 'farmer',
        },
        JWT_SECRET,
        { expiresIn: '-1h' } // Expired 1 hour ago
      );

      const caller = appRouter.createCaller(await createContext({ req: {} as any, res: {} as any }));

      const user = await caller.auth.me({
        token: expiredToken,
      });

      expect(user).toBeNull();
    });

    it('should return null for inactive user', async () => {
      // Deactivate the user
      await db!
        .update(schema.users)
        .set({ isActive: false })
        .where(eq(schema.users.id, testUserId));

      const caller = appRouter.createCaller(await createContext({ req: {} as any, res: {} as any }));

      const user = await caller.auth.me({
        token: testToken,
      });

      expect(user).toBeNull();

      // Reactivate for cleanup
      await db!
        .update(schema.users)
        .set({ isActive: true })
        .where(eq(schema.users.id, testUserId));
    });

    it('should return null for deleted user', async () => {
      // Delete the user
      await db!.delete(schema.users).where(eq(schema.users.id, testUserId));

      const caller = appRouter.createCaller(await createContext({ req: {} as any, res: {} as any }));

      const user = await caller.auth.me({
        token: testToken,
      });

      expect(user).toBeNull();

      // Reset testUserId to prevent cleanup error
      testUserId = 0;
    });

    it('should return null with empty token', async () => {
      const caller = appRouter.createCaller(await createContext({ req: {} as any, res: {} as any }));

      const user = await caller.auth.me({
        token: '',
      });

      expect(user).toBeNull();
    });
  });

  describe('JWT Token Validation', () => {
    it('should create token with correct payload structure', async () => {
      const caller = appRouter.createCaller(await createContext({ req: {} as any, res: {} as any }));
      const tokenEmail = `token_${Date.now()}@example.com`;

      const result = await caller.auth.register({
        email: tokenEmail,
        password: 'tokenPassword123',
        firstName: 'Token',
        lastName: 'Test',
      });

      const decoded = jwt.verify(result.token, JWT_SECRET) as any;

      expect(decoded).toHaveProperty('userId');
      expect(decoded).toHaveProperty('email');
      expect(decoded).toHaveProperty('role');
      expect(decoded).toHaveProperty('iat'); // Issued at
      expect(decoded).toHaveProperty('exp'); // Expiration

      expect(decoded.userId).toBe(result.user.id);
      expect(decoded.email).toBe(tokenEmail);
      expect(decoded.role).toBe('farmer');

      // Clean up
      await db!.delete(schema.users).where(eq(schema.users.id, result.user.id));
    });

    it('should create token with 7 day expiration', async () => {
      const caller = appRouter.createCaller(await createContext({ req: {} as any, res: {} as any }));
      const expiryEmail = `expiry_${Date.now()}@example.com`;

      const result = await caller.auth.register({
        email: expiryEmail,
        password: 'expiryPassword123',
        firstName: 'Expiry',
        lastName: 'Test',
      });

      const decoded = jwt.verify(result.token, JWT_SECRET) as any;
      const issuedAt = decoded.iat * 1000; // Convert to milliseconds
      const expiresAt = decoded.exp * 1000;
      const duration = expiresAt - issuedAt;

      // Should be approximately 7 days (604800000 ms)
      const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
      expect(duration).toBeCloseTo(sevenDaysInMs, -3); // Allow 1 second tolerance

      // Clean up
      await db!.delete(schema.users).where(eq(schema.users.id, result.user.id));
    });
  });

  describe('Password Security', () => {
    it('should not expose password in API responses', async () => {
      const caller = appRouter.createCaller(await createContext({ req: {} as any, res: {} as any }));
      const securityEmail = `security_${Date.now()}@example.com`;

      const registerResult = await caller.auth.register({
        email: securityEmail,
        password: 'securePassword123',
        firstName: 'Security',
        lastName: 'Test',
      });

      // Check that password is not in response
      expect(registerResult.user).not.toHaveProperty('password');

      const loginResult = await caller.auth.login({
        email: securityEmail,
        password: 'securePassword123',
      });

      // Check that password is not in login response
      expect(loginResult.user).not.toHaveProperty('password');

      const meResult = await caller.auth.me({
        token: registerResult.token,
      });

      // Check that password is not in me response
      expect(meResult).not.toHaveProperty('password');

      // Clean up
      await db!.delete(schema.users).where(eq(schema.users.id, registerResult.user.id));
    });

    it('should use bcrypt for password hashing', async () => {
      const caller = appRouter.createCaller(await createContext({ req: {} as any, res: {} as any }));
      const bcryptEmail = `bcrypt_${Date.now()}@example.com`;

      const result = await caller.auth.register({
        email: bcryptEmail,
        password: 'bcryptTest123',
        firstName: 'Bcrypt',
        lastName: 'Test',
      });

      const [user] = await db!
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, result.user.id))
        .limit(1);

      // Bcrypt hashes start with $2a$, $2b$, or $2y$
      expect(user.password).toMatch(/^\$2[aby]\$/);
      expect(user.password.length).toBeGreaterThan(50); // Bcrypt hashes are typically 60 characters

      // Clean up
      await db!.delete(schema.users).where(eq(schema.users.id, result.user.id));
    });
  });

  describe('Role Assignment', () => {
    it('should assign farmer role by default on registration', async () => {
      const caller = appRouter.createCaller(await createContext({ req: {} as any, res: {} as any }));
      const roleEmail = `role_${Date.now()}@example.com`;

      const result = await caller.auth.register({
        email: roleEmail,
        password: 'rolePassword123',
        firstName: 'Role',
        lastName: 'Test',
      });

      expect(result.user.role).toBe('farmer');

      const [user] = await db!
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, result.user.id))
        .limit(1);

      expect(user.role).toBe('farmer');

      // Clean up
      await db!.delete(schema.users).where(eq(schema.users.id, result.user.id));
    });
  });
});
