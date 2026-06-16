/**
 * Comprehensive Sync Tests
 * 
 * Tests for improved sync functionality between client and server
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { getDb } from '../db';
import { farmers, farms, crops } from '../../drizzle/schema';
import { pushChanges, pullChanges } from '../sync-router';
import { eq } from 'drizzle-orm';

// Skip all tests if database is unavailable
const _dbCheck = await import("../db.js").then(m => m.getDb()).catch(() => null);
if (!_dbCheck) { describe.skip("DB unavailable", () => { it("skip", () => {}) }); }

// Mock Kafka event producers to prevent connection timeouts
vi.mock('../event-producers.js', () => ({
  publishFarmerCreated: vi.fn().mockResolvedValue(undefined),
  publishFarmerUpdated: vi.fn().mockResolvedValue(undefined),
  publishFarmerDeleted: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../event-producers-extended.js', () => ({
  publishFarmCreated: vi.fn().mockResolvedValue(undefined),
  publishFarmUpdated: vi.fn().mockResolvedValue(undefined),
  publishFarmDeleted: vi.fn().mockResolvedValue(undefined),
  publishCropCreated: vi.fn().mockResolvedValue(undefined),
  publishCropUpdated: vi.fn().mockResolvedValue(undefined),
  publishCropDeleted: vi.fn().mockResolvedValue(undefined),
  publishLivestockCreated: vi.fn().mockResolvedValue(undefined),
  publishLivestockUpdated: vi.fn().mockResolvedValue(undefined),
  publishLivestockDeleted: vi.fn().mockResolvedValue(undefined),
  publishHarvestCreated: vi.fn().mockResolvedValue(undefined),
  publishHarvestUpdated: vi.fn().mockResolvedValue(undefined),
  publishHarvestDeleted: vi.fn().mockResolvedValue(undefined),
  publishExpenseCreated: vi.fn().mockResolvedValue(undefined),
  publishExpenseUpdated: vi.fn().mockResolvedValue(undefined),
  publishExpenseDeleted: vi.fn().mockResolvedValue(undefined),
}));

describe('Sync Router - Improved', () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  let testUserId: number;
  let testFarmerId: number;

  beforeAll(async () => {
    db = await getDb();
    if (!db) {
      console.warn('⏭️  Database not available — skipping DB-dependent tests'); return;
    }

    // Create test user (assuming users table exists)
    // For now, use a fixed test user ID
    testUserId = 1;
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await db.delete(farmers).where(eq(farmers.phoneNumber, '+1234567890'));
  });

  afterAll(async () => {
    // Clean up all test data
    await db.delete(farmers).where(eq(farmers.phoneNumber, '+1234567890'));
  });

  describe('Push Changes', () => {
    it('should push new farmer record to server', { timeout: 60000 }, async () => {
      const newFarmer = {
        userId: testUserId,
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: '+1234567890',
        email: 'john.doe@example.com',
        nationalId: 'ID123456',
        address: '123 Farm Road',
        village: 'Test Village',
        district: 'Test District',
        region: 'Test Region',
        photoUrl: null,
        version: 1,
        clientId: 'test-client-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await pushChanges(
        {
          table: 'farmers',
          records: [newFarmer],
          clientId: 'test-client-123',
        },
        testUserId
      );

      expect(result.success).toBe(true);
      expect(result.synced).toBe(1);
      expect(result.conflicts).toHaveLength(0);

      // Verify record was created
      const created = await db
        .select()
        .from(farmers)
        .where(eq(farmers.phoneNumber, '+1234567890'))
        .limit(1);

      expect(created).toHaveLength(1);
      expect(created[0].firstName).toBe('John');
      expect(created[0].lastName).toBe('Doe');
      
      testFarmerId = created[0].id;
    });

    it('should update existing farmer record', async () => {
      // Create a farmer first
      const [farmer] = await db
        .insert(farmers)
        .values({
          userId: testUserId,
          firstName: 'Jane',
          lastName: 'Smith',
          phoneNumber: '+9876543210',
          email: 'jane.smith@example.com',
          nationalId: 'ID654321',
          address: '456 Field Lane',
          village: 'Another Village',
          district: 'Another District',
          region: 'Another Region',
          photoUrl: null,
          version: 1,
          clientId: 'test-client-456',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      testFarmerId = farmer.id;

      // Update the farmer
      const updatedFarmer = {
        ...farmer,
        firstName: 'Jane Updated',
        address: '456 Updated Field Lane',
        version: 2,
        updatedAt: new Date(),
      };

      const result = await pushChanges(
        {
          table: 'farmers',
          records: [updatedFarmer],
          clientId: 'test-client-456',
        },
        testUserId
      );

      expect(result.success).toBe(true);
      expect(result.synced).toBe(1);

      // Verify update
      const updated = await db
        .select()
        .from(farmers)
        .where(eq(farmers.id, testFarmerId))
        .limit(1);

      expect(updated[0].firstName).toBe('Jane Updated');
      expect(updated[0].address).toBe('456 Updated Field Lane');
      expect(updated[0].version).toBe(2);
    });

    it('should detect version conflicts', async () => {
      // Create a farmer
      const [farmer] = await db
        .insert(farmers)
        .values({
          userId: testUserId,
          firstName: 'Conflict',
          lastName: 'Test',
          phoneNumber: '+1111111111',
          email: 'conflict@example.com',
          dateOfBirth: new Date('1990-01-01'),
          gender: 'male',
          nationalId: 'ID111111',
          address: '789 Conflict St',
          village: 'Conflict Village',
          district: 'Conflict District',
          region: 'Conflict Region',
          farmSize: 5.0,
          primaryCrop: 'Sorghum',
          secondaryCrops: [],
          educationLevel: 'none',
          householdSize: 3,
          photoUrl: null,
          latitude: -1.2921,
          longitude: 36.8219,
          version: 5, // Server has version 5
          clientId: 'test-client-789',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      testFarmerId = farmer.id;

      // Try to push version 3 (should conflict)
      const conflictingUpdate = {
        ...farmer,
        firstName: 'Conflicting Update',
        version: 3, // Client thinks it's version 3
        updatedAt: new Date(),
      };

      const result = await pushChanges(
        {
          table: 'farmers',
          records: [conflictingUpdate],
          clientId: 'test-client-789',
        },
        testUserId
      );

      expect(result.success).toBe(false);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].serverVersion).toBe(5);
      expect(result.conflicts[0].clientVersion).toBe(3);
    });
  });

  describe('Pull Changes', () => {
    it('should pull all farmers for user when no lastSyncTime', async () => {
      // Create test farmers
      const [farmer1] = await db
        .insert(farmers)
        .values({
          userId: testUserId,
          firstName: 'Pull',
          lastName: 'Test1',
          phoneNumber: '+2222222222',
          email: 'pull1@example.com',
          dateOfBirth: new Date('1975-06-10'),
          gender: 'female',
          nationalId: 'ID222222',
          address: '111 Pull Road',
          village: 'Pull Village',
          district: 'Pull District',
          region: 'Pull Region',
          farmSize: 8.0,
          primaryCrop: 'Coffee',
          secondaryCrops: ['Banana'],
          educationLevel: 'tertiary',
          householdSize: 6,
          photoUrl: null,
          latitude: -1.2921,
          longitude: 36.8219,
          version: 1,
          clientId: 'test-client-pull',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      testFarmerId = farmer1.id;

      const result = await pullChanges(
        {
          table: 'farmers',
          clientId: 'test-client-pull',
        },
        testUserId
      );

      expect(result.records.length).toBeGreaterThan(0);
      expect(result.serverTime).toBeInstanceOf(Date);
      
      // Should include our test farmer
      const foundFarmer = result.records.find((r: any) => r.id === testFarmerId);
      expect(foundFarmer).toBeDefined();
      expect(foundFarmer?.firstName).toBe('Pull');
    });

    it('should pull only updated records when lastSyncTime provided', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      // Create old farmer (should not be pulled)
      const [oldFarmer] = await db
        .insert(farmers)
        .values({
          userId: testUserId,
          firstName: 'Old',
          lastName: 'Farmer',
          phoneNumber: '+3333333333',
          email: 'old@example.com',
          dateOfBirth: new Date('1970-01-01'),
          gender: 'male',
          nationalId: 'ID333333',
          address: '222 Old Road',
          village: 'Old Village',
          district: 'Old District',
          region: 'Old Region',
          farmSize: 12.0,
          primaryCrop: 'Tea',
          secondaryCrops: [],
          educationLevel: 'primary',
          householdSize: 7,
          photoUrl: null,
          latitude: -1.2921,
          longitude: 36.8219,
          version: 1,
          clientId: 'test-client-old',
          createdAt: twoHoursAgo,
          updatedAt: twoHoursAgo,
        })
        .returning();

      // Create new farmer (should be pulled)
      const [newFarmer] = await db
        .insert(farmers)
        .values({
          userId: testUserId,
          firstName: 'New',
          lastName: 'Farmer',
          phoneNumber: '+4444444444',
          email: 'new@example.com',
          dateOfBirth: new Date('1995-12-25'),
          gender: 'female',
          nationalId: 'ID444444',
          address: '333 New Road',
          village: 'New Village',
          district: 'New District',
          region: 'New Region',
          farmSize: 6.0,
          primaryCrop: 'Vegetables',
          secondaryCrops: ['Fruits'],
          educationLevel: 'secondary',
          householdSize: 2,
          photoUrl: null,
          latitude: -1.2921,
          longitude: 36.8219,
          version: 1,
          clientId: 'test-client-new',
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      testFarmerId = newFarmer.id;

      const result = await pullChanges(
        {
          table: 'farmers',
          clientId: 'test-client-sync',
          lastSyncTime: oneHourAgo,
        },
        testUserId
      );

      // Should only include new farmer
      const foundNew = result.records.find((r: any) => r.id === newFarmer.id);
      const foundOld = result.records.find((r: any) => r.id === oldFarmer.id);

      expect(foundNew).toBeDefined();
      expect(foundOld).toBeUndefined();

      // Clean up old farmer
      await db.delete(farmers).where(eq(farmers.id, oldFarmer.id));
    });
  });

  describe('Multi-table Sync', () => {
    it('should sync farmers and farms together', async () => {
      // Create farmer
      const [farmer] = await db
        .insert(farmers)
        .values({
          userId: testUserId,
          firstName: 'Multi',
          lastName: 'Table',
          phoneNumber: '+5555555555',
          email: 'multi@example.com',
          dateOfBirth: new Date('1988-03-15'),
          gender: 'male',
          nationalId: 'ID555555',
          address: '444 Multi Road',
          village: 'Multi Village',
          district: 'Multi District',
          region: 'Multi Region',
          farmSize: 25.0,
          primaryCrop: 'Cotton',
          secondaryCrops: [],
          educationLevel: 'tertiary',
          householdSize: 4,
          photoUrl: null,
          latitude: -1.2921,
          longitude: 36.8219,
          version: 1,
          clientId: 'test-client-multi',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      testFarmerId = farmer.id;

      // Create farm for the farmer
      const newFarm = {
        userId: testUserId,
        farmerId: farmer.id,
        farmName: 'Test Farm',
        location: 'Test Location',
        latitude: -1.2921,
        longitude: 36.8219,
        totalArea: 25.0,
        cultivatedArea: 20.0,
        soilType: 'Loam',
        irrigationType: 'Drip',
        boundaryCoordinates: null,
        version: 1,
        clientId: 'test-client-multi',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const farmResult = await pushChanges(
        {
          table: 'farms',
          records: [newFarm],
          clientId: 'test-client-multi',
        },
        testUserId
      );

      expect(farmResult.success).toBe(true);
      expect(farmResult.synced).toBe(1);

      // Pull both farmers and farms
      const farmersPull = await pullChanges(
        {
          table: 'farmers',
          clientId: 'test-client-multi',
        },
        testUserId
      );

      const farmsPull = await pullChanges(
        {
          table: 'farms',
          clientId: 'test-client-multi',
        },
        testUserId
      );

      expect(farmersPull.records.length).toBeGreaterThan(0);
      expect(farmsPull.records.length).toBeGreaterThan(0);

      // Clean up farm
      const createdFarms = await db
        .select()
        .from(farms)
        .where(eq(farms.farmerId, farmer.id));
      
      for (const farm of createdFarms) {
        await db.delete(farms).where(eq(farms.id, farm.id));
      }
    });
  });
});
