import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/farmer_data';

const client = postgres(DATABASE_URL, { ssl: false });
const db = drizzle(client);

async function migrate() {
  console.log('Starting ML models schema migration...');
  
  try {
    // Create enums
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE model_type AS ENUM (
          'disease_detection',
          'pest_identification',
          'yield_prediction',
          'price_forecasting',
          'crop_recommendation',
          'soil_analysis',
          'weed_detection',
          'quality_assessment',
          'growth_stage',
          'nutrient_deficiency'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✓ Created model_type enum');

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE model_status AS ENUM ('draft', 'training', 'testing', 'published', 'deprecated', 'archived');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✓ Created model_status enum');

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE model_variant AS ENUM ('full', 'quantized', 'pruned', 'compressed', 'distilled');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✓ Created model_variant enum');

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE device_capability AS ENUM ('high', 'medium', 'low', 'minimal');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✓ Created device_capability enum');

    // Create ml_models table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ml_models (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        name VARCHAR(255) NOT NULL,
        display_name VARCHAR(255) NOT NULL,
        description TEXT,
        version VARCHAR(50) NOT NULL,
        type model_type NOT NULL,
        status model_status NOT NULL DEFAULT 'draft',
        variant model_variant NOT NULL DEFAULT 'full',
        target_device device_capability NOT NULL DEFAULT 'high',
        model_path TEXT NOT NULL,
        model_size INTEGER NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        framework VARCHAR(50) NOT NULL,
        input_shape JSONB,
        output_shape JSONB,
        trained_on JSONB,
        training_metrics JSONB,
        hyperparameters JSONB,
        supported_crops JSONB,
        supported_regions JSONB,
        supported_languages JSONB,
        min_ram_mb INTEGER NOT NULL DEFAULT 512,
        min_storage_mb INTEGER NOT NULL,
        avg_inference_ms INTEGER,
        is_official BOOLEAN NOT NULL DEFAULT FALSE,
        author_id INTEGER REFERENCES users(id),
        download_count INTEGER NOT NULL DEFAULT 0,
        usage_count INTEGER NOT NULL DEFAULT 0,
        rating INTEGER DEFAULT 0,
        rating_count INTEGER NOT NULL DEFAULT 0,
        tags JSONB,
        license VARCHAR(100),
        documentation TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
        published_at TIMESTAMP,
        deprecated_at TIMESTAMP
      );
    `);
    console.log('✓ Created ml_models table');

    // Create indexes for ml_models
    await db.execute(sql`CREATE INDEX IF NOT EXISTS ml_models_name_version_idx ON ml_models(name, version);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS ml_models_type_idx ON ml_models(type);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS ml_models_status_idx ON ml_models(status);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS ml_models_variant_idx ON ml_models(variant);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS ml_models_author_idx ON ml_models(author_id);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS ml_models_official_idx ON ml_models(is_official);`);
    console.log('✓ Created ml_models indexes');

    // Create model_downloads table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS model_downloads (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        model_id INTEGER NOT NULL REFERENCES ml_models(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        downloaded_at TIMESTAMP DEFAULT NOW() NOT NULL,
        device_info JSONB,
        download_duration_ms INTEGER,
        installed BOOLEAN NOT NULL DEFAULT FALSE,
        installed_at TIMESTAMP,
        installation_error TEXT,
        first_used_at TIMESTAMP,
        last_used_at TIMESTAMP,
        usage_count INTEGER NOT NULL DEFAULT 0
      );
    `);
    console.log('✓ Created model_downloads table');

    await db.execute(sql`CREATE INDEX IF NOT EXISTS model_downloads_model_idx ON model_downloads(model_id);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS model_downloads_user_idx ON model_downloads(user_id);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS model_downloads_downloaded_at_idx ON model_downloads(downloaded_at);`);
    console.log('✓ Created model_downloads indexes');

    // Create model_benchmarks table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS model_benchmarks (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        model_id INTEGER NOT NULL REFERENCES ml_models(id) ON DELETE CASCADE,
        benchmark_name VARCHAR(255) NOT NULL,
        dataset_name VARCHAR(255) NOT NULL,
        dataset_size INTEGER NOT NULL,
        accuracy INTEGER NOT NULL,
        precision INTEGER,
        recall INTEGER,
        f1_score INTEGER,
        avg_inference_ms INTEGER NOT NULL,
        p50_inference_ms INTEGER,
        p95_inference_ms INTEGER,
        p99_inference_ms INTEGER,
        peak_memory_mb INTEGER,
        avg_cpu_percent INTEGER,
        comparison_target VARCHAR(100),
        comparison_accuracy INTEGER,
        accuracy_delta INTEGER,
        confusion_matrix JSONB,
        per_class_metrics JSONB,
        failure_cases JSONB,
        device_info JSONB,
        test_conditions JSONB,
        conducted_by INTEGER REFERENCES users(id),
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    console.log('✓ Created model_benchmarks table');

    await db.execute(sql`CREATE INDEX IF NOT EXISTS model_benchmarks_model_idx ON model_benchmarks(model_id);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS model_benchmarks_accuracy_idx ON model_benchmarks(accuracy);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS model_benchmarks_created_at_idx ON model_benchmarks(created_at);`);
    console.log('✓ Created model_benchmarks indexes');

    // Create community_models table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS community_models (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        model_id INTEGER NOT NULL UNIQUE REFERENCES ml_models(id) ON DELETE CASCADE,
        submitted_at TIMESTAMP DEFAULT NOW() NOT NULL,
        submitted_by INTEGER NOT NULL REFERENCES users(id),
        review_status VARCHAR(50) NOT NULL DEFAULT 'pending',
        reviewed_by INTEGER REFERENCES users(id),
        reviewed_at TIMESTAMP,
        review_notes TEXT,
        upvotes INTEGER NOT NULL DEFAULT 0,
        downvotes INTEGER NOT NULL DEFAULT 0,
        report_count INTEGER NOT NULL DEFAULT 0,
        is_featured BOOLEAN NOT NULL DEFAULT FALSE,
        featured_at TIMESTAMP,
        featured_until TIMESTAMP,
        training_duration INTEGER,
        training_cost INTEGER,
        training_data_source TEXT,
        changelog TEXT,
        known_issues TEXT
      );
    `);
    console.log('✓ Created community_models table');

    await db.execute(sql`CREATE INDEX IF NOT EXISTS community_models_model_idx ON community_models(model_id);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS community_models_submitted_by_idx ON community_models(submitted_by);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS community_models_review_status_idx ON community_models(review_status);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS community_models_featured_idx ON community_models(is_featured);`);
    console.log('✓ Created community_models indexes');

    // Create model_sync_queue table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS model_sync_queue (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        model_id INTEGER NOT NULL REFERENCES ml_models(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sync_type VARCHAR(50) NOT NULL,
        priority INTEGER NOT NULL DEFAULT 5,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        progress INTEGER NOT NULL DEFAULT 0,
        current_version VARCHAR(50),
        target_version VARCHAR(50) NOT NULL,
        requires_wifi BOOLEAN NOT NULL DEFAULT TRUE,
        estimated_size_mb INTEGER,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        last_attempt_at TIMESTAMP,
        next_attempt_at TIMESTAMP,
        error_message TEXT,
        error_code VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        started_at TIMESTAMP,
        completed_at TIMESTAMP
      );
    `);
    console.log('✓ Created model_sync_queue table');

    await db.execute(sql`CREATE INDEX IF NOT EXISTS model_sync_queue_model_user_idx ON model_sync_queue(model_id, user_id);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS model_sync_queue_status_idx ON model_sync_queue(status);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS model_sync_queue_priority_idx ON model_sync_queue(priority);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS model_sync_queue_next_attempt_idx ON model_sync_queue(next_attempt_at);`);
    console.log('✓ Created model_sync_queue indexes');

    // Create model_ratings table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS model_ratings (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        model_id INTEGER NOT NULL REFERENCES ml_models(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        rating INTEGER NOT NULL,
        review TEXT,
        accuracy_rating INTEGER,
        speed_rating INTEGER,
        ease_of_use_rating INTEGER,
        used_for VARCHAR(100),
        crops_tested JSONB,
        device_used JSONB,
        helpful_count INTEGER NOT NULL DEFAULT 0,
        not_helpful_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    console.log('✓ Created model_ratings table');

    await db.execute(sql`CREATE INDEX IF NOT EXISTS model_ratings_model_user_idx ON model_ratings(model_id, user_id);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS model_ratings_rating_idx ON model_ratings(rating);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS model_ratings_created_at_idx ON model_ratings(created_at);`);
    console.log('✓ Created model_ratings indexes');

    console.log('\n✅ ML models schema migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await client.end();
  }
}

migrate();
