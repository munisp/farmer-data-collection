# ERPNext Integration API Reference

## Overview

This document provides detailed API reference for the ERPNext integration endpoints and service methods.

## Table of Contents

1. [TRPC Endpoints](#trpc-endpoints)
2. [Service Methods](#service-methods)
3. [Data Types](#data-types)
4. [Error Handling](#error-handling)
5. [Examples](#examples)

---

## TRPC Endpoints

All endpoints are available under the `/api/trpc/erpnext.*` namespace.

### Test Connection

**Endpoint**: `erpnext.testConnection`

**Method**: `POST`

**Description**: Tests the connection to the ERPNext instance.

**Request**:
```typescript
{}  // No parameters required
```

**Response**:
```typescript
{
  success: boolean;
  message: string;
}
```

**Example**:
```bash
curl -X POST https://your-app.com/api/trpc/erpnext.testConnection \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{}'
```

---

### Push Customer

**Endpoint**: `erpnext.pushCustomer`

**Method**: `POST`

**Description**: Pushes a platform user to ERPNext as a Customer.

**Request**:
```typescript
{
  userId: string;  // Platform user ID
}
```

**Response**:
```typescript
{
  success: boolean;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsFailed: number;
  errors: string[];
}
```

**Example**:
```bash
curl -X POST https://your-app.com/api/trpc/erpnext.pushCustomer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"userId": "123"}'
```

---

### Push Supplier

**Endpoint**: `erpnext.pushSupplier`

**Method**: `POST`

**Description**: Pushes a platform supplier to ERPNext.

**Request**:
```typescript
{
  supplierId: string;  // Platform supplier ID
}
```

**Response**:
```typescript
{
  success: boolean;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsFailed: number;
  errors: string[];
}
```

---

### Push Item

**Endpoint**: `erpnext.pushItem`

**Method**: `POST`

**Description**: Pushes a platform inventory item to ERPNext.

**Request**:
```typescript
{
  itemId: string;  // Platform item ID
}
```

**Response**:
```typescript
{
  success: boolean;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsFailed: number;
  errors: string[];
}
```

---

### Push Journal Entry

**Endpoint**: `erpnext.pushJournalEntry`

**Method**: `POST`

**Description**: Pushes a platform journal entry to ERPNext.

**Request**:
```typescript
{
  journalEntryId: string;  // Platform journal entry ID
}
```

**Response**:
```typescript
{
  success: boolean;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsFailed: number;
  errors: string[];
}
```

---

### Sync Entity

**Endpoint**: `erpnext.sync`

**Method**: `POST`

**Description**: Performs bidirectional sync for a specific entity type.

**Request**:
```typescript
{
  entityType: 'customer' | 'supplier' | 'item' | 'invoice' | 'payment' | 'journal';
  direction: 'push' | 'pull' | 'both';
  lastSyncTime?: Date;  // Optional: only sync records modified after this time
}
```

**Response**:
```typescript
{
  success: boolean;
  message: string;
  result: {
    success: boolean;
    recordsProcessed: number;
    recordsCreated: number;
    recordsUpdated: number;
    recordsFailed: number;
    errors: string[];
  }
}
```

**Example**:
```bash
curl -X POST https://your-app.com/api/trpc/erpnext.sync \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "entityType": "customer",
    "direction": "pull",
    "lastSyncTime": "2024-01-01T00:00:00Z"
  }'
```

---

### Perform Full Sync

**Endpoint**: `erpnext.performFullSync`

**Method**: `POST`

**Description**: Performs a complete bidirectional sync of all enabled entities.

**Request**:
```typescript
{}  // No parameters required
```

**Response**:
```typescript
{
  push: Record<string, SyncResult>;
  pull: Record<string, SyncResult>;
}
```

**Example**:
```bash
curl -X POST https://your-app.com/api/trpc/erpnext.performFullSync \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{}'
```

---

## Service Methods

### ERPNextSyncService Class

#### Constructor

```typescript
constructor(config: ERPNextConfig)
```

**Parameters**:
```typescript
interface ERPNextConfig {
  url: string;          // ERPNext instance URL (e.g., https://erp.example.com)
  apiKey: string;       // API Key from ERPNext
  apiSecret: string;    // API Secret from ERPNext
}
```

**Example**:
```typescript
import { ERPNextSyncService } from './server/services/erpnext-sync-service';

const syncService = new ERPNextSyncService({
  url: 'https://erp.example.com',
  apiKey: 'your_api_key',
  apiSecret: 'your_api_secret'
});
```

---

#### testConnection()

```typescript
async testConnection(): Promise<boolean>
```

**Description**: Tests the connection to ERPNext instance.

**Returns**: `true` if connection successful, `false` otherwise.

**Example**:
```typescript
const isConnected = await syncService.testConnection();
if (isConnected) {
  console.log('Successfully connected to ERPNext');
} else {
  console.error('Failed to connect to ERPNext');
}
```

---

#### pushCustomer()

```typescript
async pushCustomer(userId: string): Promise<SyncResult>
```

**Description**: Pushes a platform user to ERPNext as a Customer.

**Parameters**:
- `userId`: Platform user ID (string)

**Returns**: `SyncResult` object

**Example**:
```typescript
const result = await syncService.pushCustomer('123');
console.log(`Created: ${result.recordsCreated}, Updated: ${result.recordsUpdated}`);
```

---

#### pushSupplier()

```typescript
async pushSupplier(supplierId: string): Promise<SyncResult>
```

**Description**: Pushes a platform supplier to ERPNext.

**Parameters**:
- `supplierId`: Platform supplier ID (string)

**Returns**: `SyncResult` object

---

#### pushItem()

```typescript
async pushItem(itemId: string): Promise<SyncResult>
```

**Description**: Pushes a platform inventory item to ERPNext.

**Parameters**:
- `itemId`: Platform item ID (string)

**Returns**: `SyncResult` object

---

#### pushJournalEntry()

```typescript
async pushJournalEntry(journalEntryId: string): Promise<SyncResult>
```

**Description**: Pushes a platform journal entry to ERPNext.

**Parameters**:
- `journalEntryId`: Platform journal entry ID (string)

**Returns**: `SyncResult` object

---

#### pullCustomers()

```typescript
async pullCustomers(lastSyncTime?: Date): Promise<SyncResult>
```

**Description**: Pulls customers from ERPNext and creates/updates platform users.

**Parameters**:
- `lastSyncTime` (optional): Only sync records modified after this time

**Returns**: `SyncResult` object

**Example**:
```typescript
// Pull all customers
const result = await syncService.pullCustomers();

// Pull only customers modified in the last 24 hours
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
const incrementalResult = await syncService.pullCustomers(yesterday);
```

---

#### pullSuppliers()

```typescript
async pullSuppliers(lastSyncTime?: Date): Promise<SyncResult>
```

**Description**: Pulls suppliers from ERPNext and creates/updates platform suppliers.

**Parameters**:
- `lastSyncTime` (optional): Only sync records modified after this time

**Returns**: `SyncResult` object

---

#### pullItems()

```typescript
async pullItems(lastSyncTime?: Date): Promise<SyncResult>
```

**Description**: Pulls items from ERPNext and creates/updates platform inventory items.

**Parameters**:
- `lastSyncTime` (optional): Only sync records modified after this time

**Returns**: `SyncResult` object

---

#### pullJournalEntries()

```typescript
async pullJournalEntries(lastSyncTime?: Date): Promise<SyncResult>
```

**Description**: Pulls journal entries from ERPNext and creates/updates platform journal entries.

**Parameters**:
- `lastSyncTime` (optional): Only sync records modified after this time

**Returns**: `SyncResult` object

---

#### performFullSync()

```typescript
async performFullSync(): Promise<{
  push: Record<string, SyncResult>;
  pull: Record<string, SyncResult>;
}>
```

**Description**: Performs a complete bidirectional sync of all enabled entities.

**Returns**: Object with `push` and `pull` results for each entity type.

**Example**:
```typescript
const results = await syncService.performFullSync();

console.log('Pull Results:');
console.log('- Customers:', results.pull.customers);
console.log('- Suppliers:', results.pull.suppliers);
console.log('- Items:', results.pull.items);
```

---

## Data Types

### SyncResult

```typescript
interface SyncResult {
  success: boolean;           // Overall success status
  recordsProcessed: number;   // Total records processed
  recordsCreated: number;     // New records created
  recordsUpdated: number;     // Existing records updated
  recordsFailed: number;      // Records that failed to sync
  errors: string[];           // Array of error messages
}
```

---

### ERPNextConfig

```typescript
interface ERPNextConfig {
  url: string;          // ERPNext instance URL
  apiKey: string;       // API Key
  apiSecret: string;    // API Secret
}
```

---

### Entity Mapping

Platform entities are mapped to ERPNext doctypes as follows:

| Platform Entity | ERPNext Doctype | Direction |
|----------------|-----------------|-----------|
| User | Customer | Both |
| Supplier | Supplier | Both |
| Inventory Item | Item | Both |
| Journal Entry | Journal Entry | Push |
| Order | Sales Invoice | Disabled |
| Payment | Payment Entry | Disabled |

---

## Error Handling

### Common Errors

#### Connection Errors

**Error**: `Connection test failed`

**Cause**: Unable to reach ERPNext instance

**Solution**: Check network connectivity, firewall rules, and ERPNext URL

---

#### Authentication Errors

**Error**: `401 Unauthorized`

**Cause**: Invalid API credentials

**Solution**: Verify API key and secret are correct

---

#### Permission Errors

**Error**: `403 Forbidden`

**Cause**: API user lacks required permissions

**Solution**: Grant necessary permissions to the API user in ERPNext

---

#### Not Found Errors

**Error**: `404 Not Found`

**Cause**: Entity doesn't exist in source system

**Solution**: Verify entity ID is correct and entity exists

---

#### Validation Errors

**Error**: `Validation failed`

**Cause**: Required fields missing or invalid data

**Solution**: Check entity data meets ERPNext requirements

---

### Error Response Format

All errors return a `SyncResult` with:
- `success: false`
- `recordsFailed: number` (count of failed records)
- `errors: string[]` (array of error messages)

**Example Error Response**:
```json
{
  "success": false,
  "recordsProcessed": 10,
  "recordsCreated": 5,
  "recordsUpdated": 3,
  "recordsFailed": 2,
  "errors": [
    "Customer 'CUST-001' validation failed: email is required",
    "Item 'ITEM-123' not found in platform database"
  ]
}
```

---

## Examples

### Example 1: Initial Data Import

```typescript
import { ERPNextSyncService } from './server/services/erpnext-sync-service';

async function initialImport() {
  const syncService = new ERPNextSyncService({
    url: process.env.ERPNEXT_URL!,
    apiKey: process.env.ERPNEXT_API_KEY!,
    apiSecret: process.env.ERPNEXT_API_SECRET!
  });

  // Test connection first
  const connected = await syncService.testConnection();
  if (!connected) {
    throw new Error('Failed to connect to ERPNext');
  }

  // Pull all data from ERPNext
  console.log('Importing customers...');
  const customers = await syncService.pullCustomers();
  console.log(`Imported ${customers.recordsCreated} customers`);

  console.log('Importing suppliers...');
  const suppliers = await syncService.pullSuppliers();
  console.log(`Imported ${suppliers.recordsCreated} suppliers`);

  console.log('Importing items...');
  const items = await syncService.pullItems();
  console.log(`Imported ${items.recordsCreated} items`);

  console.log('Import complete!');
}

initialImport().catch(console.error);
```

---

### Example 2: Incremental Sync

```typescript
async function incrementalSync() {
  const syncService = new ERPNextSyncService({
    url: process.env.ERPNEXT_URL!,
    apiKey: process.env.ERPNEXT_API_KEY!,
    apiSecret: process.env.ERPNEXT_API_SECRET!
  });

  // Get last sync time from database
  const lastSync = await getLastSyncTime();

  // Pull only records modified since last sync
  const result = await syncService.pullCustomers(lastSync);

  console.log(`Synced ${result.recordsUpdated} updated customers`);
  console.log(`Created ${result.recordsCreated} new customers`);

  if (result.recordsFailed > 0) {
    console.error(`Failed to sync ${result.recordsFailed} customers:`);
    result.errors.forEach(err => console.error(`- ${err}`));
  }

  // Update last sync time
  await updateLastSyncTime(new Date());
}
```

---

### Example 3: Push New Data

```typescript
async function pushNewCustomer(userId: string) {
  const syncService = new ERPNextSyncService({
    url: process.env.ERPNEXT_URL!,
    apiKey: process.env.ERPNEXT_API_KEY!,
    apiSecret: process.env.ERPNEXT_API_SECRET!
  });

  const result = await syncService.pushCustomer(userId);

  if (result.success) {
    console.log('Customer successfully synced to ERPNext');
  } else {
    console.error('Failed to sync customer:', result.errors);
  }
}
```

---

### Example 4: Bidirectional Sync with Error Handling

```typescript
async function bidirectionalSync() {
  const syncService = new ERPNextSyncService({
    url: process.env.ERPNEXT_URL!,
    apiKey: process.env.ERPNEXT_API_KEY!,
    apiSecret: process.env.ERPNEXT_API_SECRET!
  });

  try {
    // Pull from ERPNext
    const pullResult = await syncService.pullCustomers();
    
    if (!pullResult.success) {
      console.error('Pull failed:', pullResult.errors);
      // Handle errors but continue
    }

    // Push to ERPNext
    const platformUsers = await getPlatformUsers();
    
    for (const user of platformUsers) {
      const pushResult = await syncService.pushCustomer(user.id.toString());
      
      if (!pushResult.success) {
        console.error(`Failed to push user ${user.id}:`, pushResult.errors);
        // Log error and continue with next user
      }
    }

    console.log('Bidirectional sync complete');
  } catch (error) {
    console.error('Sync failed with exception:', error);
    // Implement retry logic or alert admin
  }
}
```

---

### Example 5: Scheduled Sync

```typescript
import cron from 'node-cron';

// Run sync every hour
cron.schedule('0 * * * *', async () => {
  console.log('Starting scheduled sync...');
  
  const syncService = new ERPNextSyncService({
    url: process.env.ERPNEXT_URL!,
    apiKey: process.env.ERPNEXT_API_KEY!,
    apiSecret: process.env.ERPNEXT_API_SECRET!
  });

  try {
    const results = await syncService.performFullSync();
    
    // Log results
    console.log('Sync completed:');
    console.log('Pull:', results.pull);
    
    // Send notification if there were errors
    const hasErrors = Object.values(results.pull).some(r => !r.success);
    if (hasErrors) {
      await sendAdminAlert('ERPNext sync completed with errors');
    }
  } catch (error) {
    console.error('Scheduled sync failed:', error);
    await sendAdminAlert('ERPNext sync failed');
  }
});
```

---

## Rate Limiting

ERPNext API has rate limits. The sync service implements:
- 30 second timeout per request
- Automatic retry on timeout (not yet implemented)
- Batch processing for large datasets

**Recommendations**:
- Sync during off-peak hours
- Use incremental sync with `lastSyncTime`
- Process entities in batches of 100-500 records
- Implement exponential backoff for retries

---

## Security Best Practices

1. **Store credentials securely**
   ```typescript
   // ❌ Don't hardcode
   const apiKey = 'abc123';
   
   // ✅ Use environment variables
   const apiKey = process.env.ERPNEXT_API_KEY;
   ```

2. **Use HTTPS only**
   ```typescript
   // ❌ Don't use HTTP
   url: 'http://erp.example.com'
   
   // ✅ Always use HTTPS
   url: 'https://erp.example.com'
   ```

3. **Validate input**
   ```typescript
   // ✅ Validate IDs before syncing
   if (!userId || isNaN(parseInt(userId))) {
    throw new Error('Invalid user ID');
   }
   ```

4. **Log sensitive operations**
   ```typescript
   // ✅ Log all sync operations
   await logSyncOperation({
     entityType: 'customer',
     operation: 'push',
     userId,
     timestamp: new Date()
   });
   ```

---

## Support

For API issues or questions:
- Check sync logs in `erpnext_sync_log` table
- Review ERPNext API docs: https://frappeframework.com/docs/user/en/api
- File issues in project repository
