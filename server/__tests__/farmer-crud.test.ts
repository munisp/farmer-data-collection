import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getDb } from '../db';
import * as schema from '../../drizzle/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

describe('Farmer CRUD Operations', () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  let testUserId: number;
  let testFarmerId: number;

  beforeAll(async () => {
    db = await getDb();
    if (!db) {
      console.warn('⏭️  Database not available — skipping DB-dependent tests'); return;
    }

    // Create a test user for farmer operations
    const hashedPassword = await bcrypt.hash('testpassword123', 10);
    const [testUser] = await db
      .insert(schema.users)
      .values({
        email: `farmertest_${Date.now()}@example.com`,
        password: hashedPassword,
        firstName: 'Test',
        lastName: 'User',
        role: 'farmer',
        isActive: true,
      })
      .returning();
    
    testUserId = testUser.id;
  });

  afterAll(async () => {
    // Clean up test data
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

  describe('Create Farmer', () => {
    it('should create a new farmer with all required fields', async () => {
      const farmerData = {
        userId: testUserId,
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: '+1234567890',
        email: 'john.doe@example.com',
        address: '123 Farm Road',
        village: 'Green Valley',
        district: 'Central District',
        region: 'Northern Region',
        nationalId: 'NAT123456',
        version: 1,
        clientId: 'test-client-1',
      };

      const [createdFarmer] = await db!
        .insert(schema.farmers)
        .values(farmerData)
        .returning();

      testFarmerId = createdFarmer.id;

      expect(createdFarmer).toBeDefined();
      expect(createdFarmer.id).toBeTypeOf('number');
      expect(createdFarmer.firstName).toBe('John');
      expect(createdFarmer.lastName).toBe('Doe');
      expect(createdFarmer.phoneNumber).toBe('+1234567890');
      expect(createdFarmer.isActive).toBe(true);
      expect(createdFarmer.version).toBe(1);
    });

    it('should create a farmer with minimal required fields', async () => {
      const farmerData = {
        userId: testUserId,
        firstName: 'Jane',
        lastName: 'Smith',
        version: 1,
      };

      const [createdFarmer] = await db!
        .insert(schema.farmers)
        .values(farmerData)
        .returning();

      testFarmerId = createdFarmer.id;

      expect(createdFarmer).toBeDefined();
      expect(createdFarmer.firstName).toBe('Jane');
      expect(createdFarmer.lastName).toBe('Smith');
      expect(createdFarmer.userId).toBe(testUserId);
    });
  });

  describe('Read Farmer', () => {
    beforeEach(async () => {
      const [farmer] = await db!
        .insert(schema.farmers)
        .values({
          userId: testUserId,
          firstName: 'Read',
          lastName: 'Test',
          phoneNumber: '+9876543210',
          version: 1,
        })
        .returning();
      
      testFarmerId = farmer.id;
    });

    it('should retrieve farmer by id', async () => {
      const [farmer] = await db!
        .select()
        .from(schema.farmers)
        .where(eq(schema.farmers.id, testFarmerId))
        .limit(1);

      expect(farmer).toBeDefined();
      expect(farmer.id).toBe(testFarmerId);
      expect(farmer.firstName).toBe('Read');
      expect(farmer.lastName).toBe('Test');
    });

    it('should retrieve farmer by userId', async () => {
      const farmers = await db!
        .select()
        .from(schema.farmers)
        .where(eq(schema.farmers.userId, testUserId));

      expect(farmers.length).toBeGreaterThan(0);
      expect(farmers[0].userId).toBe(testUserId);
    });
  });

  describe('Update Farmer', () => {
    beforeEach(async () => {
      const [farmer] = await db!
        .insert(schema.farmers)
        .values({
          userId: testUserId,
          firstName: 'Update',
          lastName: 'Test',
          phoneNumber: '+1111111111',
          version: 1,
        })
        .returning();
      
      testFarmerId = farmer.id;
    });

    it('should update farmer information', async () => {
      const [updatedFarmer] = await db!
        .update(schema.farmers)
        .set({
          firstName: 'Updated',
          lastName: 'Name',
          phoneNumber: '+2222222222',
          version: 2,
          updatedAt: new Date(),
        })
        .where(eq(schema.farmers.id, testFarmerId))
        .returning();

      expect(updatedFarmer.firstName).toBe('Updated');
      expect(updatedFarmer.lastName).toBe('Name');
      expect(updatedFarmer.phoneNumber).toBe('+2222222222');
      expect(updatedFarmer.version).toBe(2);
    });
  });

  describe('Delete Farmer', () => {
    it('should delete a farmer', async () => {
      const [farmer] = await db!
        .insert(schema.farmers)
        .values({
          userId: testUserId,
          firstName: 'Delete',
          lastName: 'Test',
          version: 1,
        })
        .returning();

      const farmerId = farmer.id;

      await db!
        .delete(schema.farmers)
        .where(eq(schema.farmers.id, farmerId));

      const [deletedFarmer] = await db!
        .select()
        .from(schema.farmers)
        .where(eq(schema.farmers.id, farmerId))
        .limit(1);

      expect(deletedFarmer).toBeUndefined();
    });
  });
});
