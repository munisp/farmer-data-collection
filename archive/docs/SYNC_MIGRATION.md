# Bi-Directional Sync Migration Documentation

## Overview

This document describes the migration of the Farmer Data Collection Application from a pure client-side PGlite database to a hybrid architecture with bi-directional synchronization between client-side PGlite and a central PostgreSQL server.

## Architecture

### Hybrid Database Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Browser                           │
│  ┌────────────────────────────────────────────────────┐    │
│  │  PGlite (IndexedDB)                                 │    │
│  │  - Offline-first local database                     │    │
│  │  - Full PostgreSQL compatibility                    │    │
│  │  - Instant read/write operations                    │    │
│  └────────────────┬───────────────────────────────────┘    │
│                   │                                          │
│  ┌────────────────▼───────────────────────────────────┐    │
│  │  Sync Manager                                       │    │
│  │  - Automatic sync every 30 seconds                  │    │
│  │  - Manual sync trigger                              │    │
│  │  - Conflict resolution (last-write-wins)            │    │
│  │  - Version tracking for optimistic locking          │    │
│  └────────────────┬───────────────────────────────────┘    │
└───────────────────┼───────────────────────────────────────┘
                    │
                    │ HTTP/tRPC
                    │
┌───────────────────▼───────────────────────────────────────┐
│                  Server (Node.js + Express)                │
│  ┌────────────────────────────────────────────────────┐   │
│  │  tRPC Sync Endpoints                                │   │
│  │  - sync.push: Upload local changes                  │   │
│  │  - sync.pull: Download server changes               │   │
│  └────────────────┬───────────────────────────────────┘   │
│                   │                                         │
│  ┌────────────────▼───────────────────────────────────┐   │
│  │  PostgreSQL Database                                │   │
│  │  - Central data storage                             │   │
│  │  - Data aggregation across all clients              │   │
│  │  - Backup and recovery                              │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema Changes

All tables now include sync metadata fields:

- **`created_at`**: Timestamp when record was created
- **`updated_at`**: Timestamp when record was last modified
- **`version`**: Integer for optimistic locking (incremented on each update)
- **`client_id`**: Unique identifier of the client that made the change

### Example Schema (Farmers Table)

```sql
CREATE TABLE farmers (
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
  registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  -- Sync metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  version INTEGER DEFAULT 1 NOT NULL,
  client_id VARCHAR(100)
);
```

## Sync Process

### 1. Pull Changes (Server → Client)

```typescript
// Client requests changes since last sync
GET /api/trpc/sync.pull?input={
  "table": "farmers",
  "clientId": "client-123",
  "lastSyncTime": "2024-11-24T10:00:00Z"
}

// Server responds with records modified after lastSyncTime
{
  "records": [...],
  "serverTime": "2024-11-24T12:00:00Z"
}
```

**Process:**
1. Client sends last sync timestamp
2. Server queries records with `updated_at > lastSyncTime`
3. Server returns matching records
4. Client applies changes to local PGlite database
5. Conflict resolution: Server version wins if version is higher

### 2. Push Changes (Client → Server)

```typescript
// Client sends local changes to server
POST /api/trpc/sync.push
{
  "table": "farmers",
  "records": [...],
  "clientId": "client-123",
  "lastSyncTime": "2024-11-24T10:00:00Z"
}

// Server responds with sync result
{
  "success": true,
  "conflicts": [],
  "synced": 5
}
```

**Process:**
1. Client sends records modified since last sync
2. Server checks for conflicts (version mismatch)
3. Server applies changes and increments version
4. Server returns conflicts (if any) and sync count
5. Client handles conflicts (currently logs them)

## Conflict Resolution

### Strategy: Last-Write-Wins with Version Tracking

**How it works:**

1. Each record has a `version` field (starts at 1)
2. On update, version is incremented
3. When syncing, server checks:
   - If `record.version === server.version + 1` → Apply update
   - If versions don't match → Conflict detected
4. Conflicts are logged but server version currently wins

**Example:**

```
Initial state:
  Client: { id: 1, name: "John", version: 1 }
  Server: { id: 1, name: "John", version: 1 }

Client updates offline:
  Client: { id: 1, name: "John Doe", version: 2 }

Another client updates:
  Server: { id: 1, name: "John Smith", version: 2 }

Client syncs:
  - Version mismatch detected (client expects version 1, server has version 2)
  - Conflict logged
  - Server version wins (can be customized)
```

## File Structure

### Server Files

```
server/
├── index.ts           # Express server with tRPC middleware
├── trpc.ts            # tRPC router configuration
├── sync-router.ts     # Sync endpoints (push/pull logic)
└── db.ts              # PostgreSQL connection
```

### Client Files

```
client/src/
├── lib/
│   ├── trpc.ts        # tRPC client configuration
│   └── syncManager.ts # Sync manager class
├── components/
│   └── SyncStatus.tsx # Sync status UI component
├── db/
│   ├── index.ts       # PGlite initialization
│   └── schema.ts      # Database schema (with sync fields)
└── hooks/
    └── useDatabase.ts # Database initialization hook
```

### Schema Files

```
drizzle/
├── schema.ts          # Server-side PostgreSQL schema
└── migrations/        # Migration files (if using drizzle-kit)
```

## Setup Instructions

### 1. PostgreSQL Database Setup

**Option A: Local PostgreSQL**

```bash
# Start PostgreSQL service
sudo service postgresql start

# Create database
sudo -u postgres createdb farmer_data

# Set password for postgres user
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';"

# Run setup script
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/farmer_data" \
  node setup-postgres.mjs
```

**Option B: Cloud PostgreSQL**

Use a cloud provider like:
- [Neon](https://neon.tech) - Free tier with 0.5GB
- [Supabase](https://supabase.com) - Free tier with 500MB
- [Railway](https://railway.app) - Free tier available

Get the connection string and run:

```bash
DATABASE_URL="your-postgresql-connection-string" node setup-postgres.mjs
```

### 2. Environment Configuration

Update `package.json` scripts to include DATABASE_URL:

```json
{
  "scripts": {
    "dev": "concurrently \"vite --host\" \"DATABASE_URL=postgresql://... tsx watch server/index.ts\"",
    "dev:server": "DATABASE_URL=postgresql://... tsx watch server/index.ts"
  }
}
```

### 3. Start Development Server

```bash
pnpm dev
```

This starts both:
- Vite dev server (port 3000) - Client application
- Express server (port 3000) - tRPC API endpoints

## API Endpoints

### Sync Endpoints

**Pull Changes**
```
GET /api/trpc/sync.pull?input=<encoded-json>
```

**Push Changes**
```
POST /api/trpc/sync.push
Content-Type: application/json
```

## Client Usage

### Automatic Sync

The sync manager automatically syncs every 30 seconds when online:

```typescript
import { getSyncManager } from "@/lib/syncManager";

// In your component
useEffect(() => {
  const syncManager = getSyncManager();
  syncManager.startAutoSync(); // Starts automatic sync

  return () => {
    syncManager.stopAutoSync(); // Cleanup
  };
}, []);
```

### Manual Sync

```typescript
import { getSyncManager } from "@/lib/syncManager";

const handleManualSync = async () => {
  const syncManager = getSyncManager();
  await syncManager.sync();
};
```

### Sync Status

```typescript
import { getSyncManager } from "@/lib/syncManager";

const syncManager = getSyncManager();

// Subscribe to status updates
const unsubscribe = syncManager.subscribe((status) => {
  console.log('Sync status:', status);
  // status: { isSyncing, lastSyncTime, error, pendingChanges }
});

// Cleanup
unsubscribe();
```

## Testing

### Test Offline Sync

1. Open application in browser
2. Open DevTools → Network tab
3. Set to "Offline" mode
4. Add/edit data (stored in PGlite)
5. Set back to "Online"
6. Watch sync happen automatically

### Test Conflict Resolution

1. Open application in two browser tabs
2. Edit the same record in both tabs while offline
3. Go online in both tabs
4. Check console for conflict logs
5. Verify which version won

### Verify Data Sync

```bash
# Check PostgreSQL database
DATABASE_URL="postgresql://..." psql -c "SELECT * FROM farmers;"

# Check client PGlite (via browser console)
const db = await getDb();
const farmers = await db.select().from(farmers);
console.log(farmers);
```

## Known Issues & Limitations

### 1. Sync Status UI Not Visible

**Issue:** The SyncStatus component is implemented but not rendering in the UI.

**Workaround:** Check sync status via browser console:
```javascript
const syncManager = getSyncManager();
console.log(syncManager.getStatus());
```

**TODO:** Debug component rendering issue (likely HMR or import problem)

### 2. Conflict Resolution is Basic

**Current:** Last-write-wins (server version wins)

**TODO:** Implement more sophisticated strategies:
- User-prompted conflict resolution
- Field-level merging
- Conflict history tracking

### 3. No Sync Queue

**Current:** Sync attempts all changes at once

**TODO:** Implement sync queue for:
- Retry failed syncs
- Prioritize certain tables
- Batch operations efficiently

### 4. No Data Migration Tool

**Current:** Manual data migration required

**TODO:** Create migration tool to:
- Export existing PGlite data
- Import into PostgreSQL
- Verify data integrity

## Performance Considerations

### Client-Side

- **PGlite**: Instant reads/writes (no network latency)
- **Sync overhead**: ~100-500ms per table (depends on record count)
- **IndexedDB storage**: Unlimited (browser-dependent, typically 50% of available disk)

### Server-Side

- **PostgreSQL**: Optimized for concurrent writes
- **Connection pooling**: Reuses database connections
- **Query optimization**: Indexes on `updated_at` for efficient sync queries

## Security Considerations

### Authentication

**TODO:** Add authentication layer:
- JWT tokens for API requests
- User-specific data filtering
- Row-level security in PostgreSQL

### Data Validation

**Current:** Basic schema validation via Drizzle ORM

**TODO:** Add comprehensive validation:
- Input sanitization
- Business rule validation
- SQL injection prevention (already handled by Drizzle)

## Future Enhancements

1. **Real-time Sync**: WebSocket-based push notifications
2. **Selective Sync**: Only sync specific tables or date ranges
3. **Compression**: Compress sync payloads for large datasets
4. **Encryption**: End-to-end encryption for sensitive data
5. **Multi-tenancy**: Support multiple organizations
6. **Audit Log**: Track all changes with full history
7. **Data Export**: Export data to CSV/Excel
8. **Backup/Restore**: Automated backup and point-in-time recovery

## Troubleshooting

### Sync Not Working

1. Check DATABASE_URL is set correctly
2. Verify PostgreSQL is running
3. Check browser console for errors
4. Verify server logs for connection issues

### Data Not Syncing

1. Check network connectivity
2. Verify sync manager is started
3. Check for version conflicts in console
4. Verify database schema matches on both sides

### Performance Issues

1. Check number of records being synced
2. Add indexes to `updated_at` columns
3. Implement pagination for large datasets
4. Consider selective sync for specific date ranges

## Support

For issues or questions:
1. Check browser console for errors
2. Check server logs
3. Verify database connectivity
4. Review this documentation

## Changelog

### 2024-11-24 - Initial Implementation

- ✅ PostgreSQL schema with sync metadata
- ✅ tRPC sync endpoints (push/pull)
- ✅ Client-side sync manager
- ✅ Automatic background sync (30s interval)
- ✅ Manual sync trigger
- ✅ Conflict detection and logging
- ✅ Version-based optimistic locking
- ⚠️ Sync status UI (implemented but not rendering)

---

**Last Updated:** November 24, 2024
