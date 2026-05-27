# ERPNext Integration Architecture

## Overview

This document outlines the architecture for integrating the Farmer Data Collection platform with ERPNext, an open-source ERP system. The integration enables bidirectional synchronization of business data between the platform and ERPNext for advanced enterprise resource planning capabilities.

## Integration Goals

1. **Bidirectional Sync**: Keep data synchronized between platform and ERPNext
2. **Conflict Resolution**: Handle concurrent updates gracefully
3. **Selective Sync**: Allow configuration of which entities to sync
4. **Error Recovery**: Robust error handling and retry mechanisms
5. **Audit Trail**: Complete logging of all sync operations

## Architecture Components

### 1. ERPNext Sync Service (`erpnext-sync-service.ts`)

Central service handling all ERPNext API interactions:

- **API Client**: HTTP client with authentication (API key/secret)
- **Entity Mappers**: Transform platform data ↔ ERPNext format
- **Sync Engine**: Orchestrates push/pull operations
- **Conflict Resolver**: Implements last-write-wins with version tracking
- **Error Handler**: Retry logic and error logging

### 2. Database Schema

**erpnext_config** table:
```sql
- id: serial primary key
- userId: integer (references users)
- erpnextUrl: text (ERPNext instance URL)
- apiKey: text (encrypted)
- apiSecret: text (encrypted)
- syncEnabled: boolean
- lastSyncAt: timestamp
- createdAt: timestamp
- updatedAt: timestamp
```

**erpnext_sync_mapping** table:
```sql
- id: serial primary key
- userId: integer
- entityType: text (customer, supplier, item, invoice, payment, etc.)
- platformId: integer (local entity ID)
- erpnextId: text (ERPNext docname)
- syncEnabled: boolean
- lastSyncedAt: timestamp
- version: integer (for conflict detection)
- createdAt: timestamp
- updatedAt: timestamp
```

**erpnext_sync_log** table:
```sql
- id: serial primary key
- userId: integer
- operation: text (push, pull, sync)
- entityType: text
- entityId: integer
- status: text (success, error, pending)
- errorMessage: text
- requestData: jsonb
- responseData: jsonb
- createdAt: timestamp
```

### 3. Entity Mappings

#### Customer Sync
**Platform → ERPNext**
```typescript
{
  doctype: "Customer",
  customer_name: user.name,
  customer_type: "Individual",
  customer_group: "Farmers",
  territory: "Kenya",
  mobile_no: user.phone,
  email_id: user.email,
  custom_platform_id: user.id
}
```

#### Supplier Sync
**Platform → ERPNext**
```typescript
{
  doctype: "Supplier",
  supplier_name: supplier.name,
  supplier_group: "Agricultural Inputs",
  supplier_type: "Company",
  mobile_no: supplier.phone,
  email_id: supplier.email,
  custom_platform_id: supplier.id
}
```

#### Item Sync (Inventory)
**Platform → ERPNext**
```typescript
{
  doctype: "Item",
  item_code: item.itemCode,
  item_name: item.name,
  item_group: item.category,
  stock_uom: item.unit,
  valuation_method: item.valuationMethod === "fifo" ? "FIFO" : "Moving Average",
  standard_rate: item.unitCost,
  custom_platform_id: item.id
}
```

#### Sales Invoice Sync (Orders)
**Platform → ERPNext**
```typescript
{
  doctype: "Sales Invoice",
  customer: erpnextCustomerId,
  posting_date: order.createdAt,
  due_date: order.dueDate,
  items: order.items.map(item => ({
    item_code: item.erpnextItemCode,
    qty: item.quantity,
    rate: item.price,
    amount: item.quantity * item.price
  })),
  custom_platform_id: order.id
}
```

#### Payment Entry Sync
**Platform → ERPNext**
```typescript
{
  doctype: "Payment Entry",
  payment_type: "Receive",
  party_type: "Customer",
  party: erpnextCustomerId,
  paid_amount: payment.amount,
  received_amount: payment.amount,
  posting_date: payment.createdAt,
  mode_of_payment: payment.method,
  custom_platform_id: payment.id
}
```

#### Journal Entry Sync (Accounting)
**Platform → ERPNext**
```typescript
{
  doctype: "Journal Entry",
  posting_date: entry.entryDate,
  voucher_type: "Journal Entry",
  accounts: entry.lines.map(line => ({
    account: line.accountCode,
    debit_in_account_currency: line.debit,
    credit_in_account_currency: line.credit,
    user_remark: line.description
  })),
  custom_platform_id: entry.id
}
```

## Sync Strategies

### 1. Push Sync (Platform → ERPNext)

Triggered when:
- User creates/updates entity in platform
- Manual sync button clicked
- Scheduled sync job runs

Process:
1. Check if entity has ERPNext mapping
2. If mapping exists: Update ERPNext entity
3. If no mapping: Create new ERPNext entity
4. Store mapping and log result

### 2. Pull Sync (ERPNext → Platform)

Triggered when:
- Manual sync button clicked
- Scheduled sync job runs
- Webhook from ERPNext (if configured)

Process:
1. Fetch entities modified since last sync
2. Check if entity has platform mapping
3. If mapping exists: Update platform entity
4. If no mapping: Create new platform entity (optional)
5. Store mapping and log result

### 3. Conflict Resolution

**Strategy**: Last-Write-Wins with version tracking

1. Compare `version` field in mapping table
2. Compare `modified` timestamps
3. If ERPNext newer: Pull from ERPNext
4. If Platform newer: Push to ERPNext
5. If concurrent: Use configurable rule (default: ERPNext wins)
6. Log conflict in sync log

## API Endpoints

### ERPNext REST API

**Authentication**:
```
Authorization: token {api_key}:{api_secret}
```

**Common Endpoints**:
- `GET /api/resource/{doctype}` - List documents
- `GET /api/resource/{doctype}/{name}` - Get document
- `POST /api/resource/{doctype}` - Create document
- `PUT /api/resource/{doctype}/{name}` - Update document
- `DELETE /api/resource/{doctype}/{name}` - Delete document

**Custom Filters**:
```
GET /api/resource/{doctype}?filters=[["custom_platform_id","=",123]]
```

## tRPC Router (`erpnext-router.ts`)

### Configuration Endpoints

```typescript
// Save ERPNext connection settings
saveConfig: protectedProcedure
  .input(z.object({
    erpnextUrl: z.string().url(),
    apiKey: z.string(),
    apiSecret: z.string(),
  }))
  .mutation()

// Test ERPNext connection
testConnection: protectedProcedure
  .query()

// Get current configuration
getConfig: protectedProcedure
  .query()
```

### Sync Control Endpoints

```typescript
// Enable/disable sync for entity type
configureSyncEntity: protectedProcedure
  .input(z.object({
    entityType: z.enum(["customer", "supplier", "item", "invoice", "payment", "journal"]),
    enabled: z.boolean(),
  }))
  .mutation()

// Manual sync trigger
triggerSync: protectedProcedure
  .input(z.object({
    entityType: z.string(),
    direction: z.enum(["push", "pull", "both"]),
  }))
  .mutation()

// Get sync status
getSyncStatus: protectedProcedure
  .query()
```

### Monitoring Endpoints

```typescript
// Get sync history
getSyncHistory: protectedProcedure
  .input(z.object({
    limit: z.number().default(50),
    entityType: z.string().optional(),
    status: z.enum(["success", "error", "pending"]).optional(),
  }))
  .query()

// Get sync statistics
getSyncStats: protectedProcedure
  .query()

// Get entity mappings
getEntityMappings: protectedProcedure
  .input(z.object({
    entityType: z.string(),
  }))
  .query()
```

## Admin UI Components

### 1. Configuration Page (`/admin/erpnext-integration`)

**Connection Settings Card**:
- ERPNext URL input
- API Key input (masked)
- API Secret input (masked)
- Test Connection button
- Save Configuration button
- Connection status indicator

**Sync Configuration Card**:
- Toggle switches for each entity type:
  - ☐ Customers
  - ☐ Suppliers
  - ☐ Inventory Items
  - ☐ Sales Invoices
  - ☐ Payments
  - ☐ Journal Entries
- Sync direction dropdown (Push Only, Pull Only, Bidirectional)
- Conflict resolution strategy dropdown

### 2. Sync Monitoring Dashboard

**Status Cards**:
- Last Sync Time
- Total Entities Synced
- Pending Sync Count
- Error Count

**Manual Sync Section**:
- Entity type dropdown
- Direction dropdown
- Sync Now button

**Sync History Table**:
- Timestamp
- Entity Type
- Operation (Push/Pull)
- Status (Success/Error)
- Error Message (if any)
- View Details button

### 3. Entity Mapping Viewer

**Mapping Table**:
- Platform Entity ID
- Platform Entity Name
- ERPNext Entity ID
- Last Synced
- Sync Status
- Actions (Re-sync, Unlink)

## Error Handling

### Retry Strategy

1. **Transient Errors** (network, timeout):
   - Retry 3 times with exponential backoff
   - 1s, 5s, 15s delays

2. **Validation Errors** (invalid data):
   - Log error with full context
   - Mark entity as "sync_error"
   - Notify admin

3. **Authentication Errors**:
   - Disable sync
   - Notify admin immediately

### Error Logging

All errors stored in `erpnext_sync_log`:
- Full request/response data
- Error message and stack trace
- Timestamp and user context
- Retry count

## Security Considerations

1. **Credentials Storage**:
   - API keys encrypted at rest
   - Stored in environment variables or secrets manager
   - Never exposed in client-side code

2. **API Rate Limiting**:
   - Respect ERPNext rate limits
   - Implement client-side throttling
   - Queue sync operations

3. **Data Validation**:
   - Validate all data before sending to ERPNext
   - Sanitize inputs to prevent injection
   - Verify ERPNext responses

4. **Audit Trail**:
   - Log all sync operations
   - Track who initiated sync
   - Maintain version history

## Deployment Considerations

1. **Background Jobs**:
   - Use cron or scheduled tasks for periodic sync
   - Recommended: Every 15 minutes for critical data
   - Hourly for non-critical data

2. **Monitoring**:
   - Alert on sync failures
   - Track sync latency
   - Monitor API quota usage

3. **Rollback Strategy**:
   - Keep last known good state
   - Ability to disable sync quickly
   - Manual override for conflict resolution

## Testing Strategy

1. **Unit Tests**:
   - Entity mapper functions
   - Conflict resolution logic
   - Error handling

2. **Integration Tests**:
   - Mock ERPNext API responses
   - Test full sync flow
   - Test error scenarios

3. **End-to-End Tests**:
   - Test against ERPNext sandbox
   - Verify bidirectional sync
   - Test concurrent updates

## Future Enhancements

1. **Webhook Support**: Real-time sync via ERPNext webhooks
2. **Selective Field Sync**: Choose which fields to sync
3. **Batch Operations**: Bulk sync for initial data migration
4. **Sync Scheduling**: User-configurable sync intervals
5. **Advanced Conflict Resolution**: Field-level merge strategies
6. **Multi-Company Support**: Sync to multiple ERPNext instances
7. **Custom Field Mapping**: User-defined field mappings
8. **Sync Analytics**: Detailed reports on sync performance

## References

- [ERPNext REST API Documentation](https://frappeframework.com/docs/user/en/api/rest)
- [ERPNext Developer Guide](https://frappeframework.com/docs/user/en/guides)
- [Frappe Framework](https://frappeframework.com/)
