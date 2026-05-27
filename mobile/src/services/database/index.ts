import * as SQLite from 'expo-sqlite';
import { DB_NAME } from '@/utils/constants';
import type { Harvest, Expense, SyncQueueItem } from '@/types/models';

// Extended types for new entities
export interface Farmer {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  nationalId?: string | null;
  dateOfBirth?: string | null;
  gender: string;
  village: string;
  district: string;
  region: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status: string;
  synced: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Farm {
  id: string;
  name: string;
  farmerId?: string | null;
  size: number;
  sizeUnit: string;
  soilType?: string | null;
  irrigationMethod?: string | null;
  village: string;
  district: string;
  region?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string | null;
  crops?: string[];
  status: string;
  synced: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LoanApplication {
  id: string;
  farmerId?: string | null;
  farmerName: string;
  farmerPhone: string;
  amount: number;
  purpose: string;
  purposeDetails?: string | null;
  termMonths: number;
  repaymentFrequency: string;
  collateralType?: string | null;
  collateralValue?: number | null;
  farmId?: string | null;
  cropType?: string | null;
  expectedHarvestDate?: string | null;
  notes?: string | null;
  status: string;
  estimatedMonthlyPayment: number;
  amountRepaid?: number;
  paymentStatus?: string;
  synced: boolean;
  createdAt: string;
  updatedAt: string;
  submittedBy: string;
}

class Database {
  private db: SQLite.SQLiteDatabase | null = null;

  async init() {
    try {
      this.db = await SQLite.openDatabaseAsync(DB_NAME);
      await this.createTables();
      console.log('[Database] Initialized successfully');
    } catch (error) {
      console.error('[Database] Initialization failed:', error);
      throw error;
    }
  }

  private async createTables() {
    if (!this.db) throw new Error('Database not initialized');

    // Harvests table
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS harvests (
        id TEXT PRIMARY KEY,
        crop_type TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit TEXT NOT NULL,
        harvest_date TEXT NOT NULL,
        location_lat REAL,
        location_lng REAL,
        photo_uri TEXT,
        notes TEXT,
        farmer_id TEXT,
        total_value REAL,
        synced INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // Expenses table
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        expense_date TEXT NOT NULL,
        receipt_uri TEXT,
        synced INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // Farmers table
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS farmers (
        id TEXT PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        national_id TEXT,
        date_of_birth TEXT,
        gender TEXT,
        village TEXT NOT NULL,
        district TEXT NOT NULL,
        region TEXT,
        address TEXT,
        latitude REAL,
        longitude REAL,
        status TEXT DEFAULT 'active',
        synced INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // Farms table
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS farms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        farmer_id TEXT,
        size REAL NOT NULL,
        size_unit TEXT DEFAULT 'hectares',
        soil_type TEXT,
        irrigation_method TEXT,
        village TEXT NOT NULL,
        district TEXT NOT NULL,
        region TEXT,
        latitude REAL,
        longitude REAL,
        notes TEXT,
        crops TEXT,
        status TEXT DEFAULT 'active',
        synced INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // Loan applications table
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS loan_applications (
        id TEXT PRIMARY KEY,
        farmer_id TEXT,
        farmer_name TEXT NOT NULL,
        farmer_phone TEXT NOT NULL,
        amount REAL NOT NULL,
        purpose TEXT NOT NULL,
        purpose_details TEXT,
        term_months INTEGER NOT NULL,
        repayment_frequency TEXT NOT NULL,
        collateral_type TEXT,
        collateral_value REAL,
        farm_id TEXT,
        crop_type TEXT,
        expected_harvest_date TEXT,
        notes TEXT,
        status TEXT DEFAULT 'pending',
        estimated_monthly_payment REAL,
        amount_repaid REAL DEFAULT 0,
        payment_status TEXT,
        synced INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        submitted_by TEXT
      );
    `);

    // Sync queue table
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload TEXT NOT NULL,
        retry_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `);

    // Indexes
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_harvests_synced ON harvests(synced);
      CREATE INDEX IF NOT EXISTS idx_harvests_farmer ON harvests(farmer_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_synced ON expenses(synced);
      CREATE INDEX IF NOT EXISTS idx_farmers_synced ON farmers(synced);
      CREATE INDEX IF NOT EXISTS idx_farms_synced ON farms(synced);
      CREATE INDEX IF NOT EXISTS idx_farms_farmer ON farms(farmer_id);
      CREATE INDEX IF NOT EXISTS idx_loans_synced ON loan_applications(synced);
      CREATE INDEX IF NOT EXISTS idx_loans_farmer ON loan_applications(farmer_id);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_entity ON sync_queue(entity_type, entity_id);
    `);
  }

  // Harvest operations
  async getAllHarvests(): Promise<Harvest[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    const result = await this.db.getAllAsync<any>(
      'SELECT * FROM harvests ORDER BY harvest_date DESC'
    );
    
    return result.map(this.mapHarvestFromDB);
  }

  async getHarvestById(id: string): Promise<Harvest | null> {
    if (!this.db) throw new Error('Database not initialized');
    
    const result = await this.db.getFirstAsync<any>(
      'SELECT * FROM harvests WHERE id = ?',
      [id]
    );
    
    return result ? this.mapHarvestFromDB(result) : null;
  }

  async createHarvest(harvest: Harvest): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    await this.db.runAsync(
      `INSERT INTO harvests (
        id, crop_type, quantity, unit, harvest_date,
        location_lat, location_lng, photo_uri, notes,
        synced, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        harvest.id,
        harvest.cropType,
        harvest.quantity,
        harvest.unit,
        harvest.harvestDate,
        harvest.locationLat || null,
        harvest.locationLng || null,
        harvest.photoUri || null,
        harvest.notes || null,
        harvest.synced ? 1 : 0,
        harvest.createdAt,
        harvest.updatedAt,
      ]
    );
  }

  async updateHarvest(harvest: Harvest): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    await this.db.runAsync(
      `UPDATE harvests SET
        crop_type = ?, quantity = ?, unit = ?, harvest_date = ?,
        location_lat = ?, location_lng = ?, photo_uri = ?, notes = ?,
        synced = ?, updated_at = ?
      WHERE id = ?`,
      [
        harvest.cropType,
        harvest.quantity,
        harvest.unit,
        harvest.harvestDate,
        harvest.locationLat || null,
        harvest.locationLng || null,
        harvest.photoUri || null,
        harvest.notes || null,
        harvest.synced ? 1 : 0,
        harvest.updatedAt,
        harvest.id,
      ]
    );
  }

  async deleteHarvest(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.runAsync('DELETE FROM harvests WHERE id = ?', [id]);
  }

  async getUnsyncedHarvests(): Promise<Harvest[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    const result = await this.db.getAllAsync<any>(
      'SELECT * FROM harvests WHERE synced = 0'
    );
    
    return result.map(this.mapHarvestFromDB);
  }

  // Expense operations
  async getAllExpenses(): Promise<Expense[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    const result = await this.db.getAllAsync<any>(
      'SELECT * FROM expenses ORDER BY expense_date DESC'
    );
    
    return result.map(this.mapExpenseFromDB);
  }

  async getExpenseById(id: string): Promise<Expense | null> {
    if (!this.db) throw new Error('Database not initialized');
    
    const result = await this.db.getFirstAsync<any>(
      'SELECT * FROM expenses WHERE id = ?',
      [id]
    );
    
    return result ? this.mapExpenseFromDB(result) : null;
  }

  async createExpense(expense: Expense): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    await this.db.runAsync(
      `INSERT INTO expenses (
        id, category, amount, description, expense_date,
        receipt_uri, synced, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        expense.id,
        expense.category,
        expense.amount,
        expense.description || null,
        expense.expenseDate,
        expense.receiptUri || null,
        expense.synced ? 1 : 0,
        expense.createdAt,
        expense.updatedAt,
      ]
    );
  }

  async updateExpense(expense: Expense): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    await this.db.runAsync(
      `UPDATE expenses SET
        category = ?, amount = ?, description = ?, expense_date = ?,
        receipt_uri = ?, synced = ?, updated_at = ?
      WHERE id = ?`,
      [
        expense.category,
        expense.amount,
        expense.description || null,
        expense.expenseDate,
        expense.receiptUri || null,
        expense.synced ? 1 : 0,
        expense.updatedAt,
        expense.id,
      ]
    );
  }

  async deleteExpense(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.runAsync('DELETE FROM expenses WHERE id = ?', [id]);
  }

  async getUnsyncedExpenses(): Promise<Expense[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    const result = await this.db.getAllAsync<any>(
      'SELECT * FROM expenses WHERE synced = 0'
    );
    
    return result.map(this.mapExpenseFromDB);
  }

  // Sync queue operations
  async addToSyncQueue(item: Omit<SyncQueueItem, 'id' | 'retryCount' | 'createdAt'>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    await this.db.runAsync(
      `INSERT INTO sync_queue (entity_type, entity_id, operation, payload, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [item.entityType, item.entityId, item.operation, item.payload, new Date().toISOString()]
    );
  }

  async getSyncQueue(): Promise<SyncQueueItem[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    const result = await this.db.getAllAsync<any>(
      'SELECT * FROM sync_queue ORDER BY created_at ASC'
    );
    
    return result.map(row => ({
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      operation: row.operation,
      payload: row.payload,
      retryCount: row.retry_count,
      createdAt: row.created_at,
    }));
  }

  async removeSyncQueueItem(id: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.runAsync('DELETE FROM sync_queue WHERE id = ?', [id]);
  }

  async incrementSyncQueueRetry(id: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.runAsync(
      'UPDATE sync_queue SET retry_count = retry_count + 1 WHERE id = ?',
      [id]
    );
  }

  // Helper methods
  private mapHarvestFromDB(row: any): Harvest {
    return {
      id: row.id,
      cropType: row.crop_type,
      quantity: row.quantity,
      unit: row.unit,
      harvestDate: row.harvest_date,
      locationLat: row.location_lat,
      locationLng: row.location_lng,
      photoUri: row.photo_uri,
      notes: row.notes,
      synced: row.synced === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapExpenseFromDB(row: any): Expense {
    return {
      id: row.id,
      category: row.category,
      amount: row.amount,
      description: row.description,
      expenseDate: row.expense_date,
      receiptUri: row.receipt_uri,
      synced: row.synced === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async clearAll(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    await this.db.execAsync(`
      DELETE FROM harvests;
      DELETE FROM expenses;
      DELETE FROM farmers;
      DELETE FROM farms;
      DELETE FROM loan_applications;
      DELETE FROM sync_queue;
    `);
  }

  // Farmer operations
  async getAllFarmers(): Promise<Farmer[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    const result = await this.db.getAllAsync<any>(
      'SELECT * FROM farmers ORDER BY created_at DESC'
    );
    
    return result.map(this.mapFarmerFromDB);
  }

  async getFarmerById(id: string): Promise<Farmer | null> {
    if (!this.db) throw new Error('Database not initialized');
    
    const result = await this.db.getFirstAsync<any>(
      'SELECT * FROM farmers WHERE id = ?',
      [id]
    );
    
    return result ? this.mapFarmerFromDB(result) : null;
  }

  async createFarmer(farmer: Farmer): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    await this.db.runAsync(
      `INSERT INTO farmers (
        id, first_name, last_name, phone, email, national_id,
        date_of_birth, gender, village, district, region, address,
        latitude, longitude, status, synced, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        farmer.id,
        farmer.firstName,
        farmer.lastName,
        farmer.phone,
        farmer.email || null,
        farmer.nationalId || null,
        farmer.dateOfBirth || null,
        farmer.gender,
        farmer.village,
        farmer.district,
        farmer.region,
        farmer.address || null,
        farmer.latitude || null,
        farmer.longitude || null,
        farmer.status,
        farmer.synced ? 1 : 0,
        farmer.createdAt,
        farmer.updatedAt,
      ]
    );

    // Add to sync queue
    await this.addToSyncQueue({
      entityType: 'farmer',
      entityId: farmer.id,
      operation: 'create',
      payload: JSON.stringify(farmer),
    });
  }

  async updateFarmer(farmer: Farmer): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    await this.db.runAsync(
      `UPDATE farmers SET
        first_name = ?, last_name = ?, phone = ?, email = ?,
        national_id = ?, date_of_birth = ?, gender = ?, village = ?,
        district = ?, region = ?, address = ?, latitude = ?,
        longitude = ?, status = ?, synced = ?, updated_at = ?
      WHERE id = ?`,
      [
        farmer.firstName,
        farmer.lastName,
        farmer.phone,
        farmer.email || null,
        farmer.nationalId || null,
        farmer.dateOfBirth || null,
        farmer.gender,
        farmer.village,
        farmer.district,
        farmer.region,
        farmer.address || null,
        farmer.latitude || null,
        farmer.longitude || null,
        farmer.status,
        farmer.synced ? 1 : 0,
        farmer.updatedAt,
        farmer.id,
      ]
    );
  }

  async getUnsyncedFarmers(): Promise<Farmer[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    const result = await this.db.getAllAsync<any>(
      'SELECT * FROM farmers WHERE synced = 0'
    );
    
    return result.map(this.mapFarmerFromDB);
  }

  private mapFarmerFromDB(row: any): Farmer {
    return {
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone,
      email: row.email,
      nationalId: row.national_id,
      dateOfBirth: row.date_of_birth,
      gender: row.gender,
      village: row.village,
      district: row.district,
      region: row.region,
      address: row.address,
      latitude: row.latitude,
      longitude: row.longitude,
      status: row.status,
      synced: row.synced === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // Farm operations
  async getAllFarms(): Promise<Farm[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    const result = await this.db.getAllAsync<any>(
      'SELECT * FROM farms ORDER BY created_at DESC'
    );
    
    return result.map(this.mapFarmFromDB);
  }

  async getFarmById(id: string): Promise<Farm | null> {
    if (!this.db) throw new Error('Database not initialized');
    
    const result = await this.db.getFirstAsync<any>(
      'SELECT * FROM farms WHERE id = ?',
      [id]
    );
    
    return result ? this.mapFarmFromDB(result) : null;
  }

  async getFarmsByFarmerId(farmerId: string): Promise<Farm[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    const result = await this.db.getAllAsync<any>(
      'SELECT * FROM farms WHERE farmer_id = ? ORDER BY created_at DESC',
      [farmerId]
    );
    
    return result.map(this.mapFarmFromDB);
  }

  async createFarm(farm: Farm): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    await this.db.runAsync(
      `INSERT INTO farms (
        id, name, farmer_id, size, size_unit, soil_type,
        irrigation_method, village, district, region,
        latitude, longitude, notes, crops, status, synced,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        farm.id,
        farm.name,
        farm.farmerId || null,
        farm.size,
        farm.sizeUnit,
        farm.soilType || null,
        farm.irrigationMethod || null,
        farm.village,
        farm.district,
        farm.region || null,
        farm.latitude || null,
        farm.longitude || null,
        farm.notes || null,
        farm.crops ? JSON.stringify(farm.crops) : null,
        farm.status,
        farm.synced ? 1 : 0,
        farm.createdAt,
        farm.updatedAt,
      ]
    );

    // Add to sync queue
    await this.addToSyncQueue({
      entityType: 'farm',
      entityId: farm.id,
      operation: 'create',
      payload: JSON.stringify(farm),
    });
  }

  async updateFarm(farm: Farm): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    await this.db.runAsync(
      `UPDATE farms SET
        name = ?, farmer_id = ?, size = ?, size_unit = ?,
        soil_type = ?, irrigation_method = ?, village = ?,
        district = ?, region = ?, latitude = ?, longitude = ?,
        notes = ?, crops = ?, status = ?, synced = ?, updated_at = ?
      WHERE id = ?`,
      [
        farm.name,
        farm.farmerId || null,
        farm.size,
        farm.sizeUnit,
        farm.soilType || null,
        farm.irrigationMethod || null,
        farm.village,
        farm.district,
        farm.region || null,
        farm.latitude || null,
        farm.longitude || null,
        farm.notes || null,
        farm.crops ? JSON.stringify(farm.crops) : null,
        farm.status,
        farm.synced ? 1 : 0,
        farm.updatedAt,
        farm.id,
      ]
    );
  }

  async getUnsyncedFarms(): Promise<Farm[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    const result = await this.db.getAllAsync<any>(
      'SELECT * FROM farms WHERE synced = 0'
    );
    
    return result.map(this.mapFarmFromDB);
  }

  private mapFarmFromDB(row: any): Farm {
    return {
      id: row.id,
      name: row.name,
      farmerId: row.farmer_id,
      size: row.size,
      sizeUnit: row.size_unit,
      soilType: row.soil_type,
      irrigationMethod: row.irrigation_method,
      village: row.village,
      district: row.district,
      region: row.region,
      latitude: row.latitude,
      longitude: row.longitude,
      notes: row.notes,
      crops: row.crops ? JSON.parse(row.crops) : [],
      status: row.status,
      synced: row.synced === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // Loan application operations
  async getAllLoanApplications(): Promise<LoanApplication[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    const result = await this.db.getAllAsync<any>(
      'SELECT * FROM loan_applications ORDER BY created_at DESC'
    );
    
    return result.map(this.mapLoanApplicationFromDB);
  }

  async getLoanApplicationById(id: string): Promise<LoanApplication | null> {
    if (!this.db) throw new Error('Database not initialized');
    
    const result = await this.db.getFirstAsync<any>(
      'SELECT * FROM loan_applications WHERE id = ?',
      [id]
    );
    
    return result ? this.mapLoanApplicationFromDB(result) : null;
  }

  async getLoansByFarmerId(farmerId: string): Promise<LoanApplication[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    const result = await this.db.getAllAsync<any>(
      'SELECT * FROM loan_applications WHERE farmer_id = ? ORDER BY created_at DESC',
      [farmerId]
    );
    
    return result.map(this.mapLoanApplicationFromDB);
  }

  async createLoanApplication(loan: LoanApplication): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    await this.db.runAsync(
      `INSERT INTO loan_applications (
        id, farmer_id, farmer_name, farmer_phone, amount, purpose,
        purpose_details, term_months, repayment_frequency, collateral_type,
        collateral_value, farm_id, crop_type, expected_harvest_date,
        notes, status, estimated_monthly_payment, synced, created_at,
        updated_at, submitted_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        loan.id,
        loan.farmerId || null,
        loan.farmerName,
        loan.farmerPhone,
        loan.amount,
        loan.purpose,
        loan.purposeDetails || null,
        loan.termMonths,
        loan.repaymentFrequency,
        loan.collateralType || null,
        loan.collateralValue || null,
        loan.farmId || null,
        loan.cropType || null,
        loan.expectedHarvestDate || null,
        loan.notes || null,
        loan.status,
        loan.estimatedMonthlyPayment,
        loan.synced ? 1 : 0,
        loan.createdAt,
        loan.updatedAt,
        loan.submittedBy,
      ]
    );

    // Add to sync queue
    await this.addToSyncQueue({
      entityType: 'loan_application',
      entityId: loan.id,
      operation: 'create',
      payload: JSON.stringify(loan),
    });
  }

  async updateLoanApplication(loan: LoanApplication): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    await this.db.runAsync(
      `UPDATE loan_applications SET
        farmer_id = ?, farmer_name = ?, farmer_phone = ?, amount = ?,
        purpose = ?, purpose_details = ?, term_months = ?,
        repayment_frequency = ?, collateral_type = ?, collateral_value = ?,
        farm_id = ?, crop_type = ?, expected_harvest_date = ?, notes = ?,
        status = ?, estimated_monthly_payment = ?, synced = ?, updated_at = ?
      WHERE id = ?`,
      [
        loan.farmerId || null,
        loan.farmerName,
        loan.farmerPhone,
        loan.amount,
        loan.purpose,
        loan.purposeDetails || null,
        loan.termMonths,
        loan.repaymentFrequency,
        loan.collateralType || null,
        loan.collateralValue || null,
        loan.farmId || null,
        loan.cropType || null,
        loan.expectedHarvestDate || null,
        loan.notes || null,
        loan.status,
        loan.estimatedMonthlyPayment,
        loan.synced ? 1 : 0,
        loan.updatedAt,
        loan.id,
      ]
    );
  }

  async getUnsyncedLoanApplications(): Promise<LoanApplication[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    const result = await this.db.getAllAsync<any>(
      'SELECT * FROM loan_applications WHERE synced = 0'
    );
    
    return result.map(this.mapLoanApplicationFromDB);
  }

  private mapLoanApplicationFromDB(row: any): LoanApplication {
    return {
      id: row.id,
      farmerId: row.farmer_id,
      farmerName: row.farmer_name,
      farmerPhone: row.farmer_phone,
      amount: row.amount,
      purpose: row.purpose,
      purposeDetails: row.purpose_details,
      termMonths: row.term_months,
      repaymentFrequency: row.repayment_frequency,
      collateralType: row.collateral_type,
      collateralValue: row.collateral_value,
      farmId: row.farm_id,
      cropType: row.crop_type,
      expectedHarvestDate: row.expected_harvest_date,
      notes: row.notes,
      status: row.status,
      estimatedMonthlyPayment: row.estimated_monthly_payment,
      amountRepaid: row.amount_repaid,
      paymentStatus: row.payment_status,
      synced: row.synced === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      submittedBy: row.submitted_by,
    };
  }

  // Harvest operations with farmer support
  async getHarvestsByFarmerId(farmerId: string): Promise<Harvest[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    const result = await this.db.getAllAsync<any>(
      'SELECT * FROM harvests WHERE farmer_id = ? ORDER BY harvest_date DESC',
      [farmerId]
    );
    
    return result.map(this.mapHarvestFromDB);
  }

  // Get pending sync count
  async getPendingSyncCount(): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');
    
    const result = await this.db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM sync_queue'
    );
    
    return result?.count || 0;
  }
}

export const database = new Database();
