import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { appRouter } from '../trpc.js';
import { getDb } from '../db';
import type { TrpcContext } from '../_core/context';

// Skip all tests if database is unavailable
const _dbCheck = await import("../db.js").then(m => m.getDb()).catch(() => null);
if (!_dbCheck) { describe.skip("DB unavailable", () => { it("skip", () => {}) }); }

// Mock the storage module
vi.mock('../storage.js', () => ({
  storagePut: vi.fn(async (key: string) => ({
    key,
    url: `https://test-bucket.s3.amazonaws.com/${key}`
  }))
}));

/**
 * Test suite for marketplace image upload functionality
 * Tests the uploadImage procedure that was implemented to replace TODO
 */

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId: number, email: string): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `test-user-${userId}`,
    email,
    name: `Test User ${userId}`,
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe('Marketplace Image Upload', () => {
  let db: any;
  let testUserId: number;
  let testEmail: string;

  beforeAll(async () => {
    db = await getDb();
    
    // Create a test user
    testEmail = `test-upload-${Date.now()}@example.com`;
    const [user] = await db!.insert((await import('../../drizzle/schema.js')).users).values({
      email: testEmail,
      password: 'hashed_password',
      firstName: 'Test',
      lastName: 'User',
      role: 'farmer',
    }).returning();
    
    testUserId = user.id;
  });

  afterAll(async () => {
    // Cleanup test user
    if (testUserId) {
      await db!.delete((await import('../../drizzle/schema.js')).users)
        .where((await import('drizzle-orm')).eq((await import('../../drizzle/schema.js')).users.id, testUserId));
    }
  });

  it('should upload image to S3 and return URL', async () => {
    // Create a small test image (1x1 red pixel PNG)
    const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
    
    const caller = appRouter.createCaller(createAuthContext(testUserId, testEmail));

    const result = await caller.marketplace.uploadImage({
      imageData: testImageBase64,
      fileName: 'test-image.png',
      contentType: 'image/png',
    });

    // Verify result structure
    expect(result).toHaveProperty('url');
    expect(result).toHaveProperty('key');
    expect(result.url).toContain('marketplace/');
    expect(result.url).toContain(testUserId.toString());
    expect(result.key).toContain('.png');
  });

  it('should reject invalid base64 data', async () => {
    const caller = appRouter.createCaller(createAuthContext(testUserId, testEmail));

    await expect(
      caller.marketplace.uploadImage({
        imageData: 'invalid-base64!!!',
        fileName: 'test.png',
        contentType: 'image/png',
      })
    ).rejects.toThrow();
  });

  it('should generate unique file keys for multiple uploads', async () => {
    const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
    
    const caller = appRouter.createCaller(createAuthContext(testUserId, testEmail));

    const result1 = await caller.marketplace.uploadImage({
      imageData: testImageBase64,
      fileName: 'test1.png',
      contentType: 'image/png',
    });

    // Wait a bit to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 10));

    const result2 = await caller.marketplace.uploadImage({
      imageData: testImageBase64,
      fileName: 'test2.png',
      contentType: 'image/png',
    });

    // Keys should be different
    expect(result1.key).not.toBe(result2.key);
    expect(result1.url).not.toBe(result2.url);
  });
});
