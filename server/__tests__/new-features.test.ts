import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getDb } from '../db';
import * as schema from '../../drizzle/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

describe('New Features Tests', () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  let testUserId: number;
  let testFarmerId: number;

  beforeAll(async () => {
    db = await getDb();
    if (!db) {
      console.warn('⏭️  Database not available — skipping DB-dependent tests'); return;
    }

    // Create test user
    const hashedPassword = await bcrypt.hash('testpassword123', 10);
    const [testUser] = await db
      .insert(schema.users)
      .values({
        email: `newfeatures_${Date.now()}@example.com`,
        password: hashedPassword,
        firstName: 'Test',
        lastName: 'User',
        role: 'admin',
        isActive: true,
      })
      .returning();
    
    testUserId = testUser.id;
  });

  afterAll(async () => {
    // Cleanup
    if (db && testFarmerId) {
      await db.delete(schema.farmers).where(eq(schema.farmers.id, testFarmerId));
    }
    if (db && testUserId) {
      await db.delete(schema.users).where(eq(schema.users.id, testUserId));
    }
  });

  beforeEach(async () => {
    // Clean up any existing test farmers before each test
    if (db && testUserId) {
      await db.delete(schema.farmers).where(eq(schema.farmers.userId, testUserId));
    }
  });

  describe('Farmer Verification Workflow', () => {
    it('should create farmer with pending verification status', async () => {
      const [result] = await db.insert(schema.farmers).values({
        userId: testUserId,
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: '+1234567890',
        email: 'john.doe@test.com',
        nationalId: 'ID123456',
        verificationStatus: 'pending',
      }).returning();

      testFarmerId = result.id;

      expect(result.verificationStatus).toBe('pending');
      expect(result.verifiedBy).toBeNull();
      expect(result.verifiedAt).toBeNull();
    });

    it('should update farmer verification status to verified', async () => {
      // First create a farmer
      const [farmer] = await db.insert(schema.farmers).values({
        userId: testUserId,
        firstName: 'Jane',
        lastName: 'Smith',
        phoneNumber: '+1234567891',
        verificationStatus: 'pending',
      }).returning();

      // Then verify
      const [result] = await db
        .update(schema.farmers)
        .set({
          verificationStatus: 'verified',
          verifiedBy: testUserId,
          verifiedAt: new Date(),
          verificationNotes: 'Verified successfully',
        })
        .where(eq(schema.farmers.id, farmer.id))
        .returning();

      expect(result.verificationStatus).toBe('verified');
      expect(result.verifiedBy).toBe(testUserId);
      expect(result.verifiedAt).toBeTruthy();
      expect(result.verificationNotes).toBe('Verified successfully');

      // Cleanup
      await db.delete(schema.farmers).where(eq(schema.farmers.id, farmer.id));
    });

    it('should update farmer verification status to rejected', async () => {
      // First create a farmer
      const [farmer] = await db.insert(schema.farmers).values({
        userId: testUserId,
        firstName: 'Bob',
        lastName: 'Johnson',
        phoneNumber: '+1234567892',
        verificationStatus: 'pending',
      }).returning();

      // Then reject
      const [result] = await db
        .update(schema.farmers)
        .set({
          verificationStatus: 'rejected',
          verifiedBy: testUserId,
          verifiedAt: new Date(),
          verificationNotes: 'Invalid documentation',
        })
        .where(eq(schema.farmers.id, farmer.id))
        .returning();

      expect(result.verificationStatus).toBe('rejected');
      expect(result.verificationNotes).toBe('Invalid documentation');

      // Cleanup
      await db.delete(schema.farmers).where(eq(schema.farmers.id, farmer.id));
    });
  });

  describe('Conflict Resolution', () => {
    it('should track version for conflict detection', async () => {
      const [farmer] = await db.insert(schema.farmers).values({
        userId: testUserId,
        firstName: 'Version',
        lastName: 'Test',
        phoneNumber: '+1234567893',
      }).returning();

      expect(farmer.version).toBeTruthy();
      expect(typeof farmer.version).toBe('number');

      // Cleanup
      await db.delete(schema.farmers).where(eq(schema.farmers.id, farmer.id));
    });

    it('should increment version on update', async () => {
      const [farmer] = await db.insert(schema.farmers).values({
        userId: testUserId,
        firstName: 'Version',
        lastName: 'Update',
        phoneNumber: '+1234567894',
      }).returning();

      const versionBefore = farmer.version;

      const [updated] = await db
        .update(schema.farmers)
        .set({
          phoneNumber: '+9876543210',
          version: versionBefore + 1,
        })
        .where(eq(schema.farmers.id, farmer.id))
        .returning();

      expect(updated.version).toBe(versionBefore + 1);

      // Cleanup
      await db.delete(schema.farmers).where(eq(schema.farmers.id, farmer.id));
    });
  });

  describe('Pagination Support', () => {
    it('should support limit and offset for pagination', async () => {
      // Create multiple test farmers
      const farmerIds: number[] = [];
      for (let i = 0; i < 15; i++) {
        const [result] = await db.insert(schema.farmers).values({
          userId: testUserId,
          firstName: `Test${i}`,
          lastName: `Farmer${i}`,
          phoneNumber: `+123456789${String(i).padStart(2, '0')}`,
        }).returning();
        farmerIds.push(result.id);
      }

      // Test pagination
      const page1 = await db
        .select()
        .from(schema.farmers)
        .where(eq(schema.farmers.userId, testUserId))
        .limit(10)
        .offset(0);

      const page2 = await db
        .select()
        .from(schema.farmers)
        .where(eq(schema.farmers.userId, testUserId))
        .limit(10)
        .offset(10);

      expect(page1.length).toBe(10);
      expect(page2.length).toBeGreaterThan(0);

      // Cleanup
      for (const id of farmerIds) {
        await db.delete(schema.farmers).where(eq(schema.farmers.id, id));
      }
    });
  });
});
