# Frontend-Backend Sync Validation Findings

## Audit Date
December 3, 2025

## Current Architecture

### Frontend (Client)
- **Location**: `client/src/lib/syncManager.ts`
- **Database**: PGLite (local browser database)
- **Sync Interval**: 30 seconds
- **Tables Synced**: farmers, farms, crops, livestock, farmInputs, harvests, expenses

### Backend (Server)
- **Location**: `server/sync-router.ts`
- **Database**: PostgreSQL (remote)
- **Endpoints**: 
  - `sync.push` - Push local changes to server
  - `sync.pull` - Pull server changes to client

### Sync Flow
1. Client initiates sync every 30 seconds
2. For each table:
   - Pull changes from server (GET request)
   - Push local changes to server (POST request)
3. Conflict resolution: Server version wins if higher

## Issues Identified

### 1. **CRITICAL: Incorrect tRPC Query Format**
**Location**: `client/src/lib/syncManager.ts:110-116`

**Problem**: The pull request uses manual fetch with query parameters instead of tRPC client:
```typescript
const response = await fetch(
  `${this.serverUrl}/api/trpc/sync.pull?input=${encodeURIComponent(
    JSON.stringify({
      table,
      clientId: CLIENT_ID,
      lastSyncTime: this.status.lastSyncTime?.toISOString(),
    })
  )}`
);
```

**Impact**: 
- Not using tRPC client means no type safety
- Manual URL construction is error-prone
- Authentication headers may not be included
- Response parsing assumes specific structure that may not match tRPC format

### 2. **CRITICAL: Incorrect tRPC Mutation Format**
**Location**: `client/src/lib/syncManager.ts:184-195`

**Problem**: The push request uses manual fetch POST instead of tRPC client:
```typescript
const response = await fetch(`${this.serverUrl}/api/trpc/sync.push`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    table,
    records,
    clientId: CLIENT_ID,
    lastSyncTime: this.status.lastSyncTime?.toISOString(),
  }),
});
```

**Impact**:
- Missing authentication headers
- Not using tRPC mutation format
- No automatic error handling from tRPC
- Response parsing may fail

### 3. **HIGH: SQL Injection Vulnerability**
**Location**: `client/src/lib/syncManager.ts:142-148`

**Problem**: String concatenation for SQL UPDATE:
```typescript
await db.execute(
  sql`UPDATE ${sql.identifier(table)} SET ${sql.raw(
    Object.keys(record)
      .filter((k) => k !== "id")
      .map((k) => `${k} = '${record[k]}'`)  // ← SQL injection risk
      .join(", ")
  )} WHERE id = ${record.id}`
);
```

**Impact**: Potential SQL injection if record values contain quotes or malicious SQL

### 4. **HIGH: Unsafe SQL INSERT**
**Location**: `client/src/lib/syncManager.ts:152-158`

**Problem**: String concatenation for SQL INSERT:
```typescript
const columns = Object.keys(record).join(", ");
const values = Object.values(record)
  .map((v) => `'${v}'`)  // ← SQL injection risk
  .join(", ");
await db.execute(
  sql`INSERT INTO ${sql.identifier(table)} (${sql.raw(columns)}) VALUES (${sql.raw(values)})`
);
```

**Impact**: Potential SQL injection and incorrect value escaping

### 5. **MEDIUM: Missing Authentication**
**Location**: `client/src/lib/syncManager.ts:109, 184`

**Problem**: Fetch requests don't include authentication headers (JWT token)

**Impact**: 
- Sync requests will fail with 401 Unauthorized
- User context not available on server
- Cannot filter data by userId

### 6. **MEDIUM: Date Type Handling**
**Location**: `client/src/lib/syncManager.ts:114, 174`

**Problem**: Converting dates to ISO strings manually:
```typescript
lastSyncTime: this.status.lastSyncTime?.toISOString()
```

**Impact**: 
- tRPC expects Date objects, not strings
- Type mismatch between client and server schemas

### 7. **MEDIUM: No tRPC Client Integration**
**Location**: `client/src/lib/syncManager.ts`

**Problem**: SyncManager doesn't use the tRPC client that's already available in the app

**Impact**:
- Duplicated HTTP logic
- No type safety
- Missing automatic error handling
- Not leveraging tRPC's built-in features

### 8. **LOW: Inefficient Sync Strategy**
**Location**: `client/src/lib/syncManager.ts:83-91`

**Problem**: Sequential sync for all tables:
```typescript
for (const table of tables) {
  await this.pullChanges(table);
  await this.pushChanges(table);
}
```

**Impact**: 
- Slow sync process (14 sequential requests)
- Could be parallelized for better performance

### 9. **LOW: Missing Error Recovery**
**Location**: `client/src/lib/syncManager.ts:98-104`

**Problem**: Single error stops entire sync:
```typescript
catch (error) {
  console.error("Sync error:", error);
  this.updateStatus({
    isSyncing: false,
    error: error instanceof Error ? error.message : "Unknown sync error",
  });
}
```

**Impact**: One table failure prevents other tables from syncing

### 10. **INFO: Unused ERPNext Sync Scheduler**
**Location**: Server logs show ERPNext sync errors

**Problem**: `server/cron/erpnext-sync-scheduler.ts` is running but ERPNext is not configured:
```
[ERPNext Sync] Error in scheduled sync: DrizzleQueryError: Failed query
error: relation "erpnext_config" does not exist
```

**Impact**: 
- Unnecessary error logs
- Performance overhead from failed queries
- Should be disabled if not using ERPNext

## Recommendations

### Priority 1 (Critical - Fix Immediately)
1. Replace manual fetch with tRPC client in SyncManager
2. Fix SQL injection vulnerabilities in UPDATE and INSERT operations
3. Add authentication headers to sync requests

### Priority 2 (High - Fix Soon)
1. Use proper Drizzle ORM methods instead of raw SQL
2. Ensure date types are handled correctly
3. Add comprehensive error handling

### Priority 3 (Medium - Optimize)
1. Parallelize sync operations for better performance
2. Implement per-table error recovery
3. Add retry logic with exponential backoff

### Priority 4 (Low - Enhancement)
1. Disable unused ERPNext sync scheduler
2. Add sync metrics and monitoring
3. Implement incremental sync with change tracking

## Next Steps
1. Create improved SyncManager with tRPC client
2. Write comprehensive tests for sync operations
3. Validate sync with real data
4. Document sync behavior and conflict resolution
