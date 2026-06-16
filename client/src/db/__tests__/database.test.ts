import { describe, it, expect, beforeAll } from 'vitest';
import { getDb, getClient } from '../index';
import { farmers, farms, crops } from '../schema';
import { eq } from 'drizzle-orm';

describe('Database Operations', () => {
  let db: Awaited<ReturnType<typeof getDb>>;

  beforeAll(async () => {
    db = await getDb();
  });

  it('should initialize database successfully', async () => {
    expect(db).toBeDefined();
    const client = await getClient();
    expect(client).toBeDefined();
  });

  it('should create tables successfully', async () => {
    const client = await getClient();
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    const tableNames = result.rows.map((row: any) => row.table_name);
    expect(tableNames).toContain('farmers');
    expect(tableNames).toContain('farms');
    expect(tableNames).toContain('crops');
    expect(tableNames).toContain('livestock');
    expect(tableNames).toContain('farm_inputs');
    expect(tableNames).toContain('harvests');
    expect(tableNames).toContain('expenses');
  });

  it('should insert and retrieve farmer data', async () => {
    // Insert a test farmer
    const [newFarmer] = await db.insert(farmers).values({
      firstName: 'Test',
      lastName: 'Farmer',
      phoneNumber: '+1234567890',
      email: 'test@example.com',
      village: 'Test Village',
      district: 'Test District',
      region: 'Test Region',
    }).returning();

    expect(newFarmer).toBeDefined();
    expect(newFarmer.firstName).toBe('Test');
    expect(newFarmer.lastName).toBe('Farmer');

    // Retrieve the farmer
    const retrievedFarmers = await db.select().from(farmers).where(eq(farmers.id, newFarmer.id));
    expect(retrievedFarmers).toHaveLength(1);
    expect(retrievedFarmers[0].email).toBe('test@example.com');
  });

  it('should insert farm data with farmer reference', async () => {
    // First create a farmer
    const [testFarmer] = await db.insert(farmers).values({
      firstName: 'Farm',
      lastName: 'Owner',
      phoneNumber: '+9876543210',
    }).returning();

    // Then create a farm
    const [newFarm] = await db.insert(farms).values({
      farmerId: testFarmer.id,
      farmName: 'Green Acres',
      farmSize: '10.5',
      farmSizeUnit: 'acres',
      location: 'North Field',
      soilType: 'Loamy',
    }).returning();

    expect(newFarm).toBeDefined();
    expect(newFarm.farmName).toBe('Green Acres');
    expect(newFarm.farmerId).toBe(testFarmer.id);
  });

  it('should insert crop data with farm reference', async () => {
    // Create farmer and farm first
    const [testFarmer] = await db.insert(farmers).values({
      firstName: 'Crop',
      lastName: 'Grower',
    }).returning();

    const [testFarm] = await db.insert(farms).values({
      farmerId: testFarmer.id,
      farmName: 'Crop Farm',
    }).returning();

    // Insert crop
    const [newCrop] = await db.insert(crops).values({
      farmId: testFarm.id,
      cropName: 'Maize',
      cropVariety: 'Yellow Dent',
      plantingDate: new Date('2025-01-15'),
      areaPlanted: '5.0',
      areaUnit: 'acres',
      season: 'Spring 2025',
      status: 'planted',
    }).returning();

    expect(newCrop).toBeDefined();
    expect(newCrop.cropName).toBe('Maize');
    expect(newCrop.farmId).toBe(testFarm.id);
  });

  it('should update farmer data', async () => {
    // Create a farmer
    const [testFarmer] = await db.insert(farmers).values({
      firstName: 'Update',
      lastName: 'Test',
      email: 'old@example.com',
    }).returning();

    // Update the farmer
    await db.update(farmers)
      .set({ email: 'new@example.com' })
      .where(eq(farmers.id, testFarmer.id));

    // Verify update
    const [updatedFarmer] = await db.select().from(farmers).where(eq(farmers.id, testFarmer.id));
    expect(updatedFarmer.email).toBe('new@example.com');
  });

  it('should delete farmer data', async () => {
    // Create a farmer
    const [testFarmer] = await db.insert(farmers).values({
      firstName: 'Delete',
      lastName: 'Test',
    }).returning();

    // Delete the farmer
    await db.delete(farmers).where(eq(farmers.id, testFarmer.id));

    // Verify deletion
    const deletedFarmers = await db.select().from(farmers).where(eq(farmers.id, testFarmer.id));
    expect(deletedFarmers).toHaveLength(0);
  });

  it('should handle transactions', async () => {
    const client = await getClient();
    
    try {
      await client.query('BEGIN');
      
      // Insert farmer in transaction
      const farmerResult = await client.query(
        `INSERT INTO farmers (first_name, last_name) VALUES ($1, $2) RETURNING id`,
        ['Transaction', 'Test']
      );
      
      const farmerId = farmerResult.rows[0].id;
      
      // Insert farm in same transaction
      await client.query(
        `INSERT INTO farms (farmer_id, farm_name) VALUES ($1, $2)`,
        [farmerId, 'Transaction Farm']
      );
      
      await client.query('COMMIT');
      
      // Verify both records exist
      const farmerCheck = await client.query(
        `SELECT * FROM farmers WHERE id = $1`,
        [farmerId]
      );
      expect(farmerCheck.rows).toHaveLength(1);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
});
