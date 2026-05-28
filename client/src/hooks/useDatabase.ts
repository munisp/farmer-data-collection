import { useEffect, useState } from "react";
import { getDb } from "@/db";
import { sql } from "drizzle-orm";
import type { LocalDb } from "@/db/localDb";

export function useDatabase() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [db, setDb] = useState<LocalDb | null>(null);

  useEffect(() => {
    const initDatabase = async () => {
      try {
        // Get the initialized database instance
        const database = await getDb();
        setDb(database as any);

        // Create tables using standard PostgreSQL SERIAL syntax with sync metadata
        await database.execute(sql`
          CREATE TABLE IF NOT EXISTS farmers (
            id SERIAL PRIMARY KEY,
            first_name VARCHAR(100) NOT NULL,
            last_name VARCHAR(100) NOT NULL,
            phone_number VARCHAR(20),
            email VARCHAR(255),
            address TEXT,
            village VARCHAR(100),
            district VARCHAR(100),
            region VARCHAR(100),
            national_id VARCHAR(50),
            photo_url VARCHAR(500),
            registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            is_active BOOLEAN DEFAULT true NOT NULL,
            verification_status VARCHAR(20) DEFAULT 'pending' NOT NULL,
            verified_by INTEGER,
            verified_at TIMESTAMP,
            verification_notes TEXT,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            version INTEGER DEFAULT 1 NOT NULL,
            client_id VARCHAR(100)
          );
        `);

        await database.execute(sql`
          CREATE TABLE IF NOT EXISTS farms (
            id SERIAL PRIMARY KEY,
            farmer_id INTEGER NOT NULL REFERENCES farmers(id),
            farm_name VARCHAR(200) NOT NULL,
            farm_size DECIMAL(10, 2),
            farm_size_unit VARCHAR(20) DEFAULT 'acres',
            location TEXT,
            latitude DECIMAL(10, 7),
            longitude DECIMAL(10, 7),
            soil_type VARCHAR(100),
            irrigation_type VARCHAR(100),
            boundary TEXT,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            version INTEGER DEFAULT 1 NOT NULL,
            client_id VARCHAR(100)
          );
        `);

        await database.execute(sql`
          CREATE TABLE IF NOT EXISTS crops (
            id SERIAL PRIMARY KEY,
            farm_id INTEGER NOT NULL REFERENCES farms(id),
            crop_name VARCHAR(100) NOT NULL,
            crop_variety VARCHAR(100),
            planting_date TIMESTAMP NOT NULL,
            expected_harvest_date TIMESTAMP,
            actual_harvest_date TIMESTAMP,
            area_planted DECIMAL(10, 2),
            area_unit VARCHAR(20) DEFAULT 'acres',
            season VARCHAR(50),
            status VARCHAR(50) DEFAULT 'planted',
            price_per_unit INTEGER DEFAULT 1000,
            notes TEXT,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            version INTEGER DEFAULT 1 NOT NULL,
            client_id VARCHAR(100)
          );
        `);

        // Add price_per_unit column if it doesn't exist (for existing databases)
        try {
          await database.execute(sql`
            ALTER TABLE crops ADD COLUMN IF NOT EXISTS price_per_unit INTEGER DEFAULT 1000;
          `);
        } catch (e) {
          // Column might already exist, ignore error
        }

        await database.execute(sql`
          CREATE TABLE IF NOT EXISTS livestock (
            id SERIAL PRIMARY KEY,
            farm_id INTEGER NOT NULL REFERENCES farms(id),
            animal_type VARCHAR(100) NOT NULL,
            breed VARCHAR(100),
            quantity INTEGER NOT NULL,
            purpose VARCHAR(100),
            acquisition_date TIMESTAMP NOT NULL,
            acquisition_cost INTEGER,
            current_value INTEGER,
            health_status VARCHAR(50) DEFAULT 'healthy',
            notes TEXT,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            version INTEGER DEFAULT 1 NOT NULL,
            client_id VARCHAR(100)
          );
        `);

        await database.execute(sql`
          CREATE TABLE IF NOT EXISTS farm_inputs (
            id SERIAL PRIMARY KEY,
            farm_id INTEGER NOT NULL REFERENCES farms(id),
            crop_id INTEGER REFERENCES crops(id),
            input_type VARCHAR(50) NOT NULL,
            input_name VARCHAR(200) NOT NULL,
            quantity DECIMAL(10, 2) NOT NULL,
            unit VARCHAR(50) NOT NULL,
            cost_per_unit INTEGER,
            total_cost INTEGER,
            supplier VARCHAR(200),
            purchase_date TIMESTAMP NOT NULL,
            application_date TIMESTAMP,
            notes TEXT,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            version INTEGER DEFAULT 1 NOT NULL,
            client_id VARCHAR(100)
          );
        `);

        await database.execute(sql`
          CREATE TABLE IF NOT EXISTS harvests (
            id SERIAL PRIMARY KEY,
            crop_id INTEGER NOT NULL REFERENCES crops(id),
            harvest_date TIMESTAMP NOT NULL,
            quantity DECIMAL(10, 2) NOT NULL,
            unit VARCHAR(50) NOT NULL,
            quality VARCHAR(50),
            storage_location VARCHAR(200),
            market_price INTEGER,
            sold_quantity DECIMAL(10, 2),
            revenue INTEGER,
            notes TEXT,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            version INTEGER DEFAULT 1 NOT NULL,
            client_id VARCHAR(100)
          );
        `);

        await database.execute(sql`
          CREATE TABLE IF NOT EXISTS expenses (
            id SERIAL PRIMARY KEY,
            farm_id INTEGER NOT NULL REFERENCES farms(id),
            crop_id INTEGER REFERENCES crops(id),
            category VARCHAR(100) NOT NULL,
            description TEXT NOT NULL,
            amount INTEGER NOT NULL,
            expense_date TIMESTAMP NOT NULL,
            payment_method VARCHAR(50),
            receipt VARCHAR(500),
            notes TEXT,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            version INTEGER DEFAULT 1 NOT NULL,
            client_id VARCHAR(100)
          );
        `);

        setIsInitialized(true);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to initialize database"));
        console.error("Database initialization error:", err);
      }
    };

    initDatabase();
  }, []);

  return { isInitialized, error, db: db as any };
}
