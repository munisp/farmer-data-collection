# Performance Optimization Guide

## Overview

This document outlines performance optimization strategies and best practices for the Farmer Data Collection Platform to handle 1000+ concurrent users.

## Current Performance Baseline

- **Target**: 1000+ concurrent users
- **Response Time**: p95 < 500ms, p99 < 1s
- **Error Rate**: < 1%
- **Throughput**: 10,000+ requests/minute

## Database Optimization

### 1. Connection Pooling

**Current Configuration:**
```typescript
// server/db.ts
const pool = new Pool({
  connectionString: databaseUrl,
  max: 20,              // Maximum connections
  min: 5,               // Minimum connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

**Recommended for Production:**
```typescript
const pool = new Pool({
  connectionString: databaseUrl,
  max: 100,             // Increase for high load
  min: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  statement_timeout: 5000,  // Kill slow queries
});
```

### 2. Query Optimization

**Add Indexes for Frequently Queried Columns:**

```sql
-- User lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_last_signed_in ON users(last_signed_in);

-- Farmer queries
CREATE INDEX idx_farmers_user_id ON farmers(user_id);
CREATE INDEX idx_farmers_phone ON farmers(phone);

-- Farm queries
CREATE INDEX idx_farms_user_id ON farms(user_id);
CREATE INDEX idx_farms_farmer_id ON farms(farmer_id);

-- Loan queries
CREATE INDEX idx_loans_user_id ON loans(user_id);
CREATE INDEX idx_loans_farmer_id ON loans(farmer_id);
CREATE INDEX idx_loans_status ON loans(status);
CREATE INDEX idx_loans_due_date ON loans(due_date);

-- Composite indexes for common queries
CREATE INDEX idx_loans_user_status ON loans(user_id, status);
CREATE INDEX idx_repayments_loan_status ON repayments(loan_id, status);

-- Marketplace indexes
CREATE INDEX idx_products_seller_status ON products(seller_id, status);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_orders_buyer_status ON orders(buyer_id, status);
```

**Optimize Slow Queries:**

```sql
-- Before: Full table scan
SELECT * FROM loans WHERE status = 'active';

-- After: Index scan + specific columns
SELECT id, farmer_id, principal_amount, due_date 
FROM loans 
WHERE status = 'active' 
AND user_id = $1
LIMIT 100;

-- Use EXPLAIN ANALYZE to identify slow queries
EXPLAIN ANALYZE SELECT * FROM loans WHERE status = 'active';
```

### 3. Query Result Caching

**Implement Redis caching for frequently accessed data:**

```typescript
// Example: Cache dashboard statistics
async function getDashboardStats(userId: number) {
  const cacheKey = `dashboard:stats:${userId}`;
  const cached = await redis.get(cacheKey);
  
  if (cached) {
    return JSON.parse(cached);
  }
  
  const stats = await db.query(/* expensive query */);
  await redis.setex(cacheKey, 300, JSON.stringify(stats)); // Cache for 5 minutes
  
  return stats;
}
```

### 4. Database Partitioning

**For large tables (> 10M rows), consider partitioning:**

```sql
-- Partition loans by year
CREATE TABLE loans_2024 PARTITION OF loans
FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

CREATE TABLE loans_2025 PARTITION OF loans
FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
```

## API Optimization

### 1. Response Compression

**Enable gzip compression in nginx:**

```nginx
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css text/xml text/javascript application/javascript application/json;
```

### 2. Pagination

**Always paginate large result sets:**

```typescript
// Bad: Return all results
const farmers = await db.select().from('farmers');

// Good: Paginate results
const farmers = await db
  .select()
  .from('farmers')
  .where(eq('user_id', userId))
  .limit(50)
  .offset(page * 50);
```

### 3. Batch Operations

**Use batch inserts/updates instead of individual operations:**

```typescript
// Bad: Individual inserts
for (const item of items) {
  await db.insert('items').values(item);
}

// Good: Batch insert
await db.insert('items').values(items);
```

### 4. Lazy Loading

**Load related data only when needed:**

```typescript
// Bad: Eager load everything
const farmer = await db.query.farmers.findFirst({
  with: {
    farms: true,
    crops: true,
    livestock: true,
    loans: true,
  },
});

// Good: Load only what's needed
const farmer = await db.query.farmers.findFirst({
  where: eq('id', farmerId),
});

// Load related data on demand
if (needFarms) {
  const farms = await db.query.farms.findMany({
    where: eq('farmer_id', farmerId),
  });
}
```

## Caching Strategy

### 1. Multi-Level Caching

```
Browser Cache (1 hour)
  ↓
CDN Cache (1 day)
  ↓
Redis Cache (5 minutes)
  ↓
Database
```

### 2. Cache Invalidation

**Implement cache invalidation on data updates:**

```typescript
async function updateFarmer(id: number, data: any) {
  // Update database
  await db.update('farmers').set(data).where(eq('id', id));
  
  // Invalidate cache
  await redis.del(`farmer:${id}`);
  await redis.del(`farmers:list:${data.userId}`);
}
```

### 3. Cache Warming

**Pre-populate cache for frequently accessed data:**

```typescript
// Warm cache on server startup
async function warmCache() {
  const popularProducts = await db
    .select()
    .from('products')
    .orderBy(desc('view_count'))
    .limit(100);
  
  for (const product of popularProducts) {
    await redis.setex(
      `product:${product.id}`,
      3600,
      JSON.stringify(product)
    );
  }
}
```

## Frontend Optimization

### 1. Code Splitting

**Split large bundles into smaller chunks:**

```typescript
// Use dynamic imports for routes
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Farmers = lazy(() => import('./pages/Farmers'));
```

### 2. Image Optimization

**Optimize images before upload:**

- Use WebP format
- Compress images (80% quality)
- Generate thumbnails
- Lazy load images

### 3. Virtual Scrolling

**For large lists, use virtual scrolling:**

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

function LargeList({ items }) {
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
  });
  
  // Render only visible items
}
```

## Load Balancing

### 1. Horizontal Scaling

**Run multiple application instances behind a load balancer:**

```
                    ┌─────────────┐
                    │ Load        │
Internet ──────────▶│ Balancer    │
                    │ (nginx)     │
                    └─────────────┘
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
      ┌─────────┐    ┌─────────┐    ┌─────────┐
      │ App     │    │ App     │    │ App     │
      │ Server  │    │ Server  │    │ Server  │
      │ :3001   │    │ :3002   │    │ :3003   │
      └─────────┘    └─────────┘    └─────────┘
            │              │              │
            └──────────────┼──────────────┘
                           ▼
                    ┌─────────────┐
                    │ PostgreSQL  │
                    │ (Primary)   │
                    └─────────────┘
```

**Nginx load balancing configuration:**

```nginx
upstream farmer_app {
    least_conn;  # Use least connections algorithm
    server 127.0.0.1:3001 weight=1 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:3002 weight=1 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:3003 weight=1 max_fails=3 fail_timeout=30s;
    keepalive 32;
}
```

### 2. Database Read Replicas

**Use read replicas for read-heavy workloads:**

```typescript
// Write to primary
const writeDb = drizzle(primaryPool);
await writeDb.insert('farmers').values(data);

// Read from replica
const readDb = drizzle(replicaPool);
const farmers = await readDb.select().from('farmers');
```

## Monitoring & Profiling

### 1. Identify Bottlenecks

**Use profiling tools:**

```bash
# Node.js profiling
node --prof server/index.js
node --prof-process isolate-*.log > processed.txt

# Database query analysis
EXPLAIN ANALYZE SELECT * FROM loans WHERE status = 'active';

# Redis monitoring
redis-cli --latency
redis-cli --stat
```

### 2. Performance Metrics

**Track key metrics:**

- Response time (p50, p95, p99)
- Throughput (requests/second)
- Error rate
- Database query time
- Cache hit rate
- Memory usage
- CPU usage

### 3. Continuous Monitoring

**Set up alerts for performance degradation:**

```yaml
# Prometheus alert rules
- alert: HighResponseTime
  expr: http_request_duration_seconds{quantile="0.95"} > 0.5
  for: 5m
  annotations:
    summary: "High response time detected"

- alert: HighDatabaseLatency
  expr: db_query_duration_seconds{quantile="0.95"} > 0.1
  for: 5m
  annotations:
    summary: "High database latency detected"
```

## Performance Checklist

### Database
- [ ] Connection pooling configured (max: 100)
- [ ] Indexes created for frequently queried columns
- [ ] Slow queries optimized (< 100ms)
- [ ] Query result caching implemented
- [ ] Database partitioning for large tables

### API
- [ ] Response compression enabled
- [ ] Pagination implemented for all lists
- [ ] Batch operations used where possible
- [ ] Rate limiting configured
- [ ] API response caching

### Frontend
- [ ] Code splitting implemented
- [ ] Images optimized (WebP, compressed)
- [ ] Virtual scrolling for large lists
- [ ] Lazy loading for routes
- [ ] Service worker for offline support

### Infrastructure
- [ ] Load balancing configured
- [ ] Multiple app instances running
- [ ] Database read replicas set up
- [ ] CDN configured for static assets
- [ ] Redis caching layer active

### Monitoring
- [ ] Performance metrics tracked
- [ ] Alerts configured for degradation
- [ ] Load testing performed
- [ ] Bottlenecks identified and fixed
- [ ] Continuous monitoring in place

## Load Testing Results

**Target**: 1000 concurrent users

**Expected Results:**
- Response time p95: < 500ms
- Response time p99: < 1s
- Error rate: < 1%
- Throughput: > 10,000 req/min

**Run load test:**
```bash
k6 run --vus 1000 --duration 10m tests/load/k6-load-test.js
```

## Next Steps

1. Run baseline load test
2. Identify bottlenecks
3. Implement optimizations
4. Re-run load test
5. Repeat until targets met
6. Document findings
7. Set up continuous monitoring
