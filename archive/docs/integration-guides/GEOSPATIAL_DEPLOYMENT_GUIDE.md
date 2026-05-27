# Geospatial Features Deployment Guide

Step-by-step guide to deploying the geospatial features in production.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [PostgreSQL with PostGIS Setup](#postgresql-with-postgis-setup)
3. [Database Migration](#database-migration)
4. [Application Configuration](#application-configuration)
5. [Frontend Deployment](#frontend-deployment)
6. [Testing](#testing)
7. [Performance Tuning](#performance-tuning)
8. [Monitoring](#monitoring)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

- **PostgreSQL 14+** with PostGIS extension
- **Node.js 18+** for the application
- **Google Maps API key** (already configured via Manus proxy)

### Required Knowledge

- Basic PostgreSQL administration
- SQL and spatial SQL (PostGIS)
- Node.js/TypeScript development
- Docker (optional, for containerized deployment)

---

## PostgreSQL with PostGIS Setup

### Option 1: Ubuntu/Debian

```bash
# Install PostgreSQL 14
sudo apt update
sudo apt install -y postgresql-14 postgresql-client-14

# Install PostGIS
sudo apt install -y postgresql-14-postgis-3

# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Verify installation
psql --version
```

### Option 2: Docker

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgis/postgis:14-3.3
    container_name: farmer-db
    environment:
      POSTGRES_DB: farmer_data
      POSTGRES_USER: farmer_user
      POSTGRES_PASSWORD: secure_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U farmer_user -d farmer_data"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

```bash
# Start PostgreSQL with PostGIS
docker-compose up -d

# Verify PostGIS is available
docker exec -it farmer-db psql -U farmer_user -d farmer_data -c "SELECT PostGIS_Version();"
```

### Option 3: Cloud Providers

**AWS RDS:**
```bash
# Create RDS PostgreSQL instance with PostGIS
aws rds create-db-instance \
  --db-instance-identifier farmer-db \
  --db-instance-class db.t3.medium \
  --engine postgres \
  --engine-version 14.7 \
  --master-username farmer_user \
  --master-user-password secure_password \
  --allocated-storage 100 \
  --storage-type gp3 \
  --enable-cloudwatch-logs-exports '["postgresql"]'

# Enable PostGIS after instance is ready
psql -h farmer-db.xxxxxx.us-east-1.rds.amazonaws.com -U farmer_user -d farmer_data -c "CREATE EXTENSION postgis;"
```

**Google Cloud SQL:**
```bash
# Create Cloud SQL PostgreSQL instance
gcloud sql instances create farmer-db \
  --database-version=POSTGRES_14 \
  --tier=db-custom-2-8192 \
  --region=us-central1

# Enable PostGIS
gcloud sql databases create farmer_data --instance=farmer-db
psql -h <CLOUD_SQL_IP> -U postgres -d farmer_data -c "CREATE EXTENSION postgis;"
```

**Azure Database for PostgreSQL:**
```bash
# Create Azure PostgreSQL server
az postgres server create \
  --resource-group farmer-rg \
  --name farmer-db \
  --location eastus \
  --admin-user farmer_user \
  --admin-password secure_password \
  --sku-name GP_Gen5_2 \
  --version 14

# Enable PostGIS
psql -h farmer-db.postgres.database.azure.com -U farmer_user@farmer-db -d farmer_data -c "CREATE EXTENSION postgis;"
```

---

## Database Migration

### Step 1: Enable PostGIS Extension

```bash
# Connect to database
psql -U farmer_user -d farmer_data

# Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

# Verify installation
SELECT PostGIS_Version();
SELECT PostGIS_Full_Version();

# Check spatial reference systems
SELECT COUNT(*) FROM spatial_ref_sys;  -- Should return 8000+
```

### Step 2: Run Migrations

```bash
# Navigate to project directory
cd /home/ubuntu/farmer-data-collection

# Run PostGIS migrations
psql -U farmer_user -d farmer_data -f drizzle/migrations/001_enable_postgis.sql
psql -U farmer_user -d farmer_data -f drizzle/migrations/002_migrate_farms_to_postgis.sql
psql -U farmer_user -d farmer_data -f drizzle/migrations/003_create_farm_boundaries.sql

# Or use Drizzle migration tool
pnpm db:push
```

### Step 3: Verify Migration

```sql
-- Check if location column exists
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'farms' AND column_name = 'location';

-- Check spatial index
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'farms' AND indexname LIKE '%location%';

-- Check farm_boundaries table
SELECT COUNT(*) FROM farm_boundaries;

-- Verify geometry types
SELECT 
  f_table_name,
  f_geometry_column,
  type,
  srid
FROM geometry_columns
WHERE f_table_name IN ('farms', 'farm_boundaries');
```

### Step 4: Migrate Existing Data

```sql
-- Populate location column from latitude/longitude
UPDATE farms
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE latitude IS NOT NULL 
  AND longitude IS NOT NULL
  AND location IS NULL;

-- Verify data migration
SELECT 
  COUNT(*) as total_farms,
  COUNT(location) as farms_with_location,
  COUNT(*) - COUNT(location) as farms_missing_location
FROM farms;
```

---

## Application Configuration

### Step 1: Update Environment Variables

```bash
# .env.production
DATABASE_URL=postgresql://farmer_user:secure_password@localhost:5432/farmer_data

# For SSL connections (recommended for production)
DATABASE_URL=postgresql://farmer_user:secure_password@localhost:5432/farmer_data?sslmode=require

# For cloud databases
DATABASE_URL=postgresql://farmer_user:secure_password@farmer-db.xxxxxx.us-east-1.rds.amazonaws.com:5432/farmer_data?sslmode=require
```

### Step 2: Install Dependencies

```bash
# Install production dependencies
pnpm install --prod

# Build application
pnpm build
```

### Step 3: Test Database Connection

```bash
# Test connection
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT PostGIS_Version()', (err, res) => {
  if (err) {
    console.error('Connection failed:', err);
    process.exit(1);
  }
  console.log('PostGIS version:', res.rows[0].postgis_version);
  pool.end();
});
"
```

---

## Frontend Deployment

### Step 1: Build Frontend

```bash
# Build production bundle
pnpm build

# Output will be in dist/ directory
ls -lh dist/
```

### Step 2: Deploy to Server

**Option 1: Static Hosting (Vercel, Netlify, Cloudflare Pages)**

```bash
# Deploy to Vercel
vercel --prod

# Deploy to Netlify
netlify deploy --prod --dir=dist

# Deploy to Cloudflare Pages
wrangler pages publish dist
```

**Option 2: Self-Hosted (Nginx)**

```nginx
# /etc/nginx/sites-available/farmer-app
server {
    listen 80;
    server_name farmer.example.com;
    
    root /var/www/farmer-app/dist;
    index index.html;
    
    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    
    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # API proxy
    location /api/ {
        proxy_pass http://localhost:3000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/farmer-app /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Set up SSL with Let's Encrypt
sudo certbot --nginx -d farmer.example.com
```

### Step 3: Deploy Backend API

**Option 1: PM2 (Process Manager)**

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start pnpm --name farmer-api -- start

# Save PM2 configuration
pm2 save

# Set up auto-start on boot
pm2 startup
```

**Option 2: Docker**

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN npm install -g pnpm && pnpm install --prod

# Copy application files
COPY . .

# Build application
RUN pnpm build

# Expose port
EXPOSE 3000

# Start application
CMD ["pnpm", "start"]
```

```bash
# Build Docker image
docker build -t farmer-app:latest .

# Run container
docker run -d \
  --name farmer-api \
  -p 3000:3000 \
  -e DATABASE_URL=$DATABASE_URL \
  farmer-app:latest
```

**Option 3: Kubernetes**

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: farmer-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: farmer-api
  template:
    metadata:
      labels:
        app: farmer-api
    spec:
      containers:
      - name: farmer-api
        image: farmer-app:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: farmer-secrets
              key: database-url
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
---
apiVersion: v1
kind: Service
metadata:
  name: farmer-api
spec:
  selector:
    app: farmer-api
  ports:
  - port: 80
    targetPort: 3000
  type: LoadBalancer
```

---

## Testing

### Step 1: Test PostGIS Functions

```sql
-- Test spatial queries
SELECT 
  id,
  name,
  ST_AsText(location) as location_wkt,
  ST_X(location) as longitude,
  ST_Y(location) as latitude
FROM farms
WHERE location IS NOT NULL
LIMIT 5;

-- Test distance query
SELECT 
  f1.name as farm1,
  f2.name as farm2,
  ST_Distance(f1.location::geography, f2.location::geography) / 1000 as distance_km
FROM farms f1
CROSS JOIN farms f2
WHERE f1.id < f2.id
  AND f1.location IS NOT NULL
  AND f2.location IS NOT NULL
LIMIT 10;

-- Test spatial index usage
EXPLAIN ANALYZE
SELECT * FROM farms
WHERE ST_DWithin(
  location::geography,
  ST_SetSRID(ST_MakePoint(3.3792, 6.5244), 4326)::geography,
  5000
);
```

### Step 2: Test API Endpoints

```bash
# Test spatial query endpoints
curl -X POST http://localhost:3000/api/trpc/spatial.findFarmsWithinRadius \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "latitude": 6.5244,
    "longitude": 3.3792,
    "radiusMeters": 5000
  }'

# Test GeoJSON export
curl http://localhost:3000/api/trpc/spatial.getAllBoundariesGeoJSON \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  > boundaries.geojson
```

### Step 3: Load Testing

```bash
# Install Apache Bench
sudo apt install apache2-utils

# Load test spatial queries
ab -n 1000 -c 10 -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3000/api/trpc/spatial.findNearestFarms
```

---

## Performance Tuning

### PostgreSQL Configuration

```ini
# /etc/postgresql/14/main/postgresql.conf

# Memory settings
shared_buffers = 4GB
effective_cache_size = 12GB
maintenance_work_mem = 1GB
work_mem = 64MB

# Parallel query settings
max_parallel_workers_per_gather = 4
max_parallel_workers = 8

# PostGIS-specific settings
random_page_cost = 1.1  # For SSD storage
effective_io_concurrency = 200

# Connection pooling
max_connections = 200
```

### Spatial Index Optimization

```sql
-- Analyze tables for query planner
ANALYZE farms;
ANALYZE farm_boundaries;

-- Rebuild spatial indexes if needed
REINDEX INDEX idx_farms_location;
REINDEX INDEX idx_farm_boundaries_boundary;

-- Check index usage
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename IN ('farms', 'farm_boundaries')
ORDER BY idx_scan DESC;
```

### Application-Level Caching

```typescript
// Implement Redis caching for frequent queries
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// Cache spatial query results
async function findFarmsWithinRadius(lat: number, lng: number, radius: number) {
  const cacheKey = `farms:radius:${lat}:${lng}:${radius}`;
  
  // Check cache first
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }
  
  // Query database
  const result = await db.execute(sql`...`);
  
  // Cache for 5 minutes
  await redis.setex(cacheKey, 300, JSON.stringify(result));
  
  return result;
}
```

---

## Monitoring

### Metrics to Track

```sql
-- Database size
SELECT 
  pg_size_pretty(pg_database_size('farmer_data')) as database_size;

-- Table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Index sizes
SELECT 
  indexname,
  pg_size_pretty(pg_relation_size(indexname::regclass)) as size
FROM pg_indexes
WHERE tablename IN ('farms', 'farm_boundaries');

-- Slow queries
SELECT 
  query,
  calls,
  total_exec_time / 1000 as total_seconds,
  mean_exec_time / 1000 as avg_seconds
FROM pg_stat_statements
WHERE query LIKE '%ST_%'
ORDER BY total_exec_time DESC
LIMIT 10;
```

### Set Up Prometheus Monitoring

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'postgres'
    static_configs:
      - targets: ['localhost:9187']
    metrics_path: /metrics
```

```bash
# Install postgres_exporter
docker run -d \
  --name postgres-exporter \
  -p 9187:9187 \
  -e DATA_SOURCE_NAME="postgresql://farmer_user:password@localhost:5432/farmer_data?sslmode=disable" \
  prometheuscommunity/postgres-exporter
```

---

## Troubleshooting

### Issue 1: PostGIS Extension Not Found

```bash
# Check if PostGIS is installed
dpkg -l | grep postgis

# Install if missing
sudo apt install postgresql-14-postgis-3

# Restart PostgreSQL
sudo systemctl restart postgresql
```

### Issue 2: Invalid Geometry Errors

```sql
-- Find invalid geometries
SELECT id, ST_IsValidReason(location)
FROM farms
WHERE NOT ST_IsValid(location);

-- Fix invalid geometries
UPDATE farms
SET location = ST_MakeValid(location)
WHERE NOT ST_IsValid(location);
```

### Issue 3: Slow Spatial Queries

```sql
-- Check if spatial index is being used
EXPLAIN ANALYZE
SELECT * FROM farms
WHERE ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint(3.3792, 6.5244), 4326)::geography, 5000);

-- Rebuild index if not used
REINDEX INDEX idx_farms_location;

-- Update statistics
ANALYZE farms;
```

### Issue 4: Connection Pool Exhausted

```typescript
// Increase connection pool size
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 50,  // Increase from default 10
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});
```

---

## Next Steps

1. **Set up monitoring** (Prometheus + Grafana)
2. **Implement backup strategy** (pg_dump + S3)
3. **Configure CDN** for static assets
4. **Set up CI/CD pipeline** (GitHub Actions)
5. **Implement rate limiting** (Redis + API Gateway)
6. **Add health check endpoints**
7. **Set up log aggregation** (ELK stack)

---

## References

- [PostGIS Documentation](https://postgis.net/documentation/)
- [PostgreSQL Performance Tuning](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [Nginx Configuration](https://nginx.org/en/docs/)
- [PM2 Documentation](https://pm2.keymetrics.io/docs/)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
