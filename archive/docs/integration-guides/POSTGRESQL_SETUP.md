# PostgreSQL Database Setup Guide

This guide walks you through setting up PostgreSQL for the Farmer Data Collection platform, including PostGIS for spatial features.

---

## Overview

The platform uses PostgreSQL with PostGIS extension for:
- **Server-side data storage** - User data, farms, crops, livestock, etc.
- **Spatial features** - Farm boundaries, GPS tracking, geofencing
- **Real-time sync** - Bi-directional sync between client and server
- **Advanced features** - Microfinance, SMS scheduling, marketplace, etc.

---

## Option 1: Local PostgreSQL (Development)

### 1.1 Install PostgreSQL

**macOS (using Homebrew):**
```bash
brew install postgresql@15 postgis
brew services start postgresql@15
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql-15 postgresql-15-postgis-3
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**Windows:**
1. Download PostgreSQL installer from [postgresql.org](https://www.postgresql.org/download/windows/)
2. Run installer and follow wizard
3. Install PostGIS from Stack Builder during installation

### 1.2 Create Database

```bash
# Connect to PostgreSQL
psql postgres

# Create database
CREATE DATABASE farmer_data_collection;

# Create user
CREATE USER farmer_admin WITH PASSWORD 'your_secure_password';

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE farmer_data_collection TO farmer_admin;

# Connect to database
\c farmer_data_collection

# Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

# Verify PostGIS
SELECT PostGIS_Version();

# Exit
\q
```

### 1.3 Configure Environment Variables

Add to your `.env` file:

```bash
# PostgreSQL Database Configuration
DATABASE_URL=postgresql://farmer_admin:your_secure_password@localhost:5432/farmer_data_collection

# Optional: Connection pool settings
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
```

---

## Option 2: Cloud PostgreSQL (Production)

### 2.1 Neon (Recommended - Free Tier Available)

**Features:**
- Serverless PostgreSQL
- Automatic scaling
- Free tier: 3 GB storage, 100 hours compute/month
- Built-in connection pooling

**Setup:**
1. Visit [neon.tech](https://neon.tech)
2. Sign up for free account
3. Create new project
4. Select region closest to your users
5. Copy connection string

**Connection String Format:**
```
postgresql://user:password@ep-xxx-xxx.region.aws.neon.tech/dbname?sslmode=require
```

### 2.2 Supabase (Recommended - Free Tier Available)

**Features:**
- PostgreSQL with PostGIS included
- Built-in authentication (optional)
- Real-time subscriptions
- Free tier: 500 MB database, unlimited API requests

**Setup:**
1. Visit [supabase.com](https://supabase.com)
2. Create new project
3. Wait for database provisioning (2-3 minutes)
4. Go to Settings → Database
5. Copy connection string (use "Connection pooling" for production)

**Connection String:**
```
postgresql://postgres:[YOUR-PASSWORD]@db.xxx.supabase.co:5432/postgres
```

### 2.3 Railway

**Features:**
- Simple deployment
- Pay-as-you-go pricing
- Free tier: $5 credit/month

**Setup:**
1. Visit [railway.app](https://railway.app)
2. Create new project
3. Add PostgreSQL service
4. Copy `DATABASE_URL` from variables tab

### 2.4 Render

**Features:**
- Managed PostgreSQL
- Free tier: 90 days, then $7/month

**Setup:**
1. Visit [render.com](https://render.com)
2. Create new PostgreSQL instance
3. Copy internal/external connection string

---

## Step 3: Run Database Migrations

### 3.1 Install Drizzle Kit

```bash
cd /home/ubuntu/farmer-data-collection
pnpm add -D drizzle-kit
```

### 3.2 Generate Migrations

```bash
# Generate migration files from schema
pnpm drizzle-kit generate
```

### 3.3 Run Migrations

```bash
# Apply migrations to database
pnpm drizzle-kit migrate
```

### 3.4 Verify Tables Created

```bash
# Connect to database
psql $DATABASE_URL

# List all tables
\dt

# Expected tables (100+):
# - users
# - farmers
# - farms
# - crops
# - livestock
# - harvests
# - expenses
# - farm_boundaries (PostGIS)
# - gps_devices
# - gps_tracks
# - marketplace_listings
# - marketplace_orders
# - loans
# - disbursements
# - sms_templates
# - sms_scheduled_messages
# ... and many more

# Exit
\q
```

---

## Step 4: Configure PostGIS (Spatial Features)

### 4.1 Verify PostGIS Extension

```sql
-- Connect to database
psql $DATABASE_URL

-- Check PostGIS version
SELECT PostGIS_Version();

-- Should return something like: "3.3 USE_GEOS=1 USE_PROJ=1 USE_STATS=1"

-- Check spatial reference systems
SELECT COUNT(*) FROM spatial_ref_sys;

-- Should return 8500+ spatial reference systems
```

### 4.2 Test Spatial Queries

```sql
-- Create a test point
SELECT ST_AsText(ST_MakePoint(3.3792, 6.5244)); -- Lagos, Nigeria

-- Calculate distance between two points (in meters)
SELECT ST_Distance(
  ST_MakePoint(3.3792, 6.5244)::geography,  -- Lagos
  ST_MakePoint(3.3958, 6.4550)::geography   -- Ikeja
);

-- Should return approximately 8000-9000 meters
```

---

## Step 5: Seed Initial Data (Optional)

### 5.1 Create Seed Script

Create `server/scripts/seed-database.ts`:

```typescript
import { getDb } from '../db';
import { users, farmers, farms } from '../../drizzle/schema';

async function seed() {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  console.log('Seeding database...');

  // Add seed data here
  // Example: Create test user, farmers, farms

  console.log('Seeding complete!');
}

seed().catch(console.error);
```

### 5.2 Run Seed Script

```bash
pnpm tsx server/scripts/seed-database.ts
```

---

## Step 6: Configure Connection Pooling

### 6.1 For Production (Recommended)

Add to `.env`:

```bash
# Connection Pool Settings
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=20
DATABASE_IDLE_TIMEOUT=10000
DATABASE_CONNECTION_TIMEOUT=5000
```

### 6.2 For Serverless (Neon, Supabase)

Use connection pooling URL:

**Neon:**
```bash
DATABASE_URL=postgresql://user:password@ep-xxx-xxx.region.aws.neon.tech/dbname?sslmode=require&pooler=true
```

**Supabase:**
```bash
# Use connection pooling port 6543 instead of 5432
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:6543/postgres
```

---

## Step 7: Enable SSL/TLS (Production)

### 7.1 Configure SSL Mode

For cloud databases, always use SSL:

```bash
DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=require
```

**SSL Modes:**
- `disable` - No SSL (development only)
- `require` - SSL required (recommended for production)
- `verify-ca` - Verify certificate authority
- `verify-full` - Full certificate verification

### 7.2 Download CA Certificate (if needed)

Some providers require CA certificate:

```bash
# Download certificate
curl -o ca-certificate.crt https://your-provider.com/ca-cert.crt

# Update connection string
DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=verify-ca&sslrootcert=./ca-certificate.crt
```

---

## Step 8: Backup and Recovery

### 8.1 Manual Backup

```bash
# Backup entire database
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Backup specific tables
pg_dump $DATABASE_URL -t farmers -t farms > backup_core_tables.sql

# Backup with compression
pg_dump $DATABASE_URL | gzip > backup_$(date +%Y%m%d).sql.gz
```

### 8.2 Restore from Backup

```bash
# Restore from backup
psql $DATABASE_URL < backup_20251203.sql

# Restore from compressed backup
gunzip -c backup_20251203.sql.gz | psql $DATABASE_URL
```

### 8.3 Automated Backups (Cloud Providers)

**Neon:** Automatic point-in-time recovery (PITR) included  
**Supabase:** Daily backups included in paid plans  
**Railway:** Manual backups via CLI  
**Render:** Automatic daily backups included

---

## Step 9: Performance Optimization

### 9.1 Create Indexes

```sql
-- User-related indexes
CREATE INDEX idx_farmers_user_id ON farmers(user_id);
CREATE INDEX idx_farms_user_id ON farms(user_id);
CREATE INDEX idx_crops_user_id ON crops(user_id);

-- Spatial indexes (PostGIS)
CREATE INDEX idx_farm_boundaries_geom ON farm_boundaries USING GIST(boundary);
CREATE INDEX idx_gps_tracks_location ON gps_tracks USING GIST(location);

-- Timestamp indexes for queries
CREATE INDEX idx_harvests_date ON harvests(harvest_date);
CREATE INDEX idx_expenses_date ON expenses(expense_date);

-- Marketplace indexes
CREATE INDEX idx_marketplace_listings_status ON marketplace_listings(status);
CREATE INDEX idx_marketplace_orders_user ON marketplace_orders(buyer_id);
```

### 9.2 Analyze Query Performance

```sql
-- Explain query execution plan
EXPLAIN ANALYZE
SELECT * FROM farms WHERE user_id = 1;

-- Check slow queries
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY total_time DESC
LIMIT 10;
```

### 9.3 Vacuum and Analyze

```sql
-- Reclaim storage and update statistics
VACUUM ANALYZE;

-- Auto-vacuum settings (add to postgresql.conf)
autovacuum = on
autovacuum_max_workers = 3
autovacuum_naptime = 1min
```

---

## Step 10: Monitoring

### 10.1 Check Database Size

```sql
-- Database size
SELECT pg_size_pretty(pg_database_size('farmer_data_collection'));

-- Table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 20;
```

### 10.2 Check Active Connections

```sql
-- Current connections
SELECT count(*) FROM pg_stat_activity;

-- Connections by database
SELECT datname, count(*) 
FROM pg_stat_activity 
GROUP BY datname;

-- Long-running queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active'
ORDER BY duration DESC;
```

### 10.3 Set Up Monitoring (Production)

**Using Supabase:**
- Built-in dashboard shows queries, connections, storage

**Using Neon:**
- Metrics available in dashboard
- Set up alerts for high CPU/memory

**Using External Tools:**
- [pgAdmin](https://www.pgadmin.org/) - GUI management tool
- [DataGrip](https://www.jetbrains.com/datagrip/) - Database IDE
- [Grafana](https://grafana.com/) - Monitoring dashboards

---

## Troubleshooting

### Common Issues

**1. "Connection refused" Error**
- **Cause:** PostgreSQL not running or wrong host/port
- **Solution:** Check PostgreSQL status, verify connection string

**2. "Password authentication failed"**
- **Cause:** Wrong username/password
- **Solution:** Reset password or verify credentials

**3. "Database does not exist"**
- **Cause:** Database not created
- **Solution:** Run `CREATE DATABASE` command

**4. "PostGIS extension not found"**
- **Cause:** PostGIS not installed
- **Solution:** Install PostGIS package and run `CREATE EXTENSION postgis`

**5. "Too many connections"**
- **Cause:** Connection pool exhausted
- **Solution:** Increase `max_connections` or use connection pooling

**6. "SSL connection required"**
- **Cause:** Cloud database requires SSL
- **Solution:** Add `?sslmode=require` to connection string

---

## Production Checklist

Before deploying to production:

- [ ] PostgreSQL database created
- [ ] PostGIS extension enabled
- [ ] DATABASE_URL configured
- [ ] All migrations run successfully
- [ ] Indexes created for performance
- [ ] SSL/TLS enabled
- [ ] Connection pooling configured
- [ ] Backup strategy in place
- [ ] Monitoring set up
- [ ] Security rules configured
- [ ] Test data seeded (if needed)

---

## Next Steps

After setting up PostgreSQL:

1. **Test database connection** - Restart server and verify no connection errors
2. **Run migrations** - Apply all schema changes
3. **Test features** - Create farmers, farms, and test data sync
4. **Set up GPS tracking** - Test spatial queries and geofencing

---

## Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [PostGIS Documentation](https://postgis.net/documentation/)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [Neon Documentation](https://neon.tech/docs)
- [Supabase Documentation](https://supabase.com/docs)

---

**Questions or Issues?**

Check the server logs for detailed error messages, or review the troubleshooting section above.
