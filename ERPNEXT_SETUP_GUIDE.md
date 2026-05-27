# ERPNext Integration Setup Guide

## Overview

This guide explains how to integrate your Farmer Data Collection App with ERPNext for bidirectional synchronization of customers, suppliers, inventory items, and accounting data.

## Prerequisites

1. **ERPNext Instance**: You need a running ERPNext instance (v13 or later recommended)
2. **API Credentials**: API Key and API Secret from ERPNext
3. **Database Access**: Your app's database must be accessible
4. **Network Access**: Your app must be able to reach the ERPNext instance

## Step 1: Generate ERPNext API Credentials

### In ERPNext:

1. Log in to your ERPNext instance as Administrator
2. Go to **User List** (search for "User" in the search bar)
3. Create a new user or select an existing user for API access
4. Enable **API Access** for the user
5. Click on **Generate Keys** or **API Secret**
6. Copy the **API Key** and **API Secret** - you'll need these

### Required Permissions

The API user needs permissions for:
- Customer (Read, Write, Create)
- Supplier (Read, Write, Create)
- Item (Read, Write, Create)
- Sales Invoice (Read, Write, Create)
- Payment Entry (Read, Write, Create)
- Journal Entry (Read, Write, Create)

## Step 2: Configure Integration in Your App

### Database Setup

Run the database migration to create ERPNext integration tables:

```bash
cd /home/ubuntu/farmer-data-collection
pnpm db:push
```

This creates the following tables:
- `erpnext_config` - Stores ERPNext connection details
- `erpnext_sync_mapping` - Maps platform entities to ERPNext entities
- `erpnext_sync_log` - Logs all sync operations
- `erpnext_sync_queue` - Queue for async sync operations
- `erpnext_sync_config` - Per-entity sync configuration
- `erpnext_sync_conflicts` - Tracks sync conflicts for manual resolution

### Add ERPNext Configuration

Insert your ERPNext credentials into the database:

```sql
INSERT INTO erpnext_config (
  user_id,
  erpnext_url,
  api_key,
  api_secret,
  sync_enabled
) VALUES (
  1, -- Your user ID
  'https://your-erpnext-instance.com', -- Your ERPNext URL (no trailing slash)
  'your_api_key_here',
  'your_api_secret_here',
  true
);
```

**Security Note**: In production, encrypt the `api_key` and `api_secret` fields.

## Step 3: Test the Connection

### Using the API Endpoint

```bash
curl -X POST https://your-app-domain.com/api/trpc/erpnext.testConnection \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{}'
```

Expected response:
```json
{
  "success": true,
  "message": "Successfully connected to ERPNext"
}
```

### Using the Service Directly

```typescript
import { ERPNextSyncService } from './server/services/erpnext-sync-service';

const syncService = new ERPNextSyncService({
  url: 'https://your-erpnext-instance.com',
  apiKey: 'your_api_key',
  apiSecret: 'your_api_secret'
});

const connected = await syncService.testConnection();
console.log('Connected:', connected);
```

## Step 4: Configure Sync Settings

Configure which entities to sync and in which direction:

```sql
INSERT INTO erpnext_sync_config (
  user_id,
  entity_type,
  sync_enabled,
  sync_direction,
  conflict_resolution
) VALUES
  (1, 'customer', true, 'both', 'erpnext_wins'),
  (1, 'supplier', true, 'both', 'erpnext_wins'),
  (1, 'item', true, 'both', 'platform_wins'),
  (1, 'invoice', true, 'push', 'erpnext_wins'),
  (1, 'payment', true, 'push', 'erpnext_wins'),
  (1, 'journal', true, 'both', 'manual');
```

**Sync Directions**:
- `push`: Platform → ERPNext only
- `pull`: ERPNext → Platform only
- `both`: Bidirectional sync

**Conflict Resolution**:
- `erpnext_wins`: ERPNext data overwrites platform data
- `platform_wins`: Platform data overwrites ERPNext data
- `manual`: Conflicts logged for manual resolution

## Step 5: Perform Initial Sync

### Pull Data from ERPNext

```bash
# Pull customers
curl -X POST https://your-app-domain.com/api/trpc/erpnext.sync \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "entityType": "customer",
    "direction": "pull"
  }'

# Pull suppliers
curl -X POST https://your-app-domain.com/api/trpc/erpnext.sync \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "entityType": "supplier",
    "direction": "pull"
  }'

# Pull items
curl -X POST https://your-app-domain.com/api/trpc/erpnext.sync \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "entityType": "item",
    "direction": "pull"
  }'
```

### Push Data to ERPNext

```bash
# Push a specific customer
curl -X POST https://your-app-domain.com/api/trpc/erpnext.pushCustomer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "userId": "1"
  }'

# Push a specific supplier
curl -X POST https://your-app-domain.com/api/trpc/erpnext.pushSupplier \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "supplierId": "1"
  }'
```

## Step 6: Monitor Sync Operations

### View Sync Logs

```sql
SELECT 
  id,
  operation,
  entity_type,
  status,
  error_message,
  created_at
FROM erpnext_sync_log
ORDER BY created_at DESC
LIMIT 50;
```

### View Entity Mappings

```sql
SELECT 
  entity_type,
  platform_id,
  erpnext_id,
  erpnext_doctype,
  last_synced_at
FROM erpnext_sync_mapping
ORDER BY last_synced_at DESC;
```

### Check for Conflicts

```sql
SELECT 
  entity_type,
  platform_id,
  erpnext_id,
  status,
  created_at
FROM erpnext_sync_conflicts
WHERE status = 'pending'
ORDER BY created_at DESC;
```

## Supported Entities

### ✅ Fully Implemented

1. **Customers** (Platform Users ↔ ERPNext Customers)
   - Push: Creates/updates ERPNext Customer from platform user
   - Pull: Creates/updates platform user from ERPNext Customer
   - Mapping: `user` → `Customer`

2. **Suppliers** (Platform Suppliers ↔ ERPNext Suppliers)
   - Push: Creates/updates ERPNext Supplier
   - Pull: Creates/updates platform supplier
   - Mapping: `supplier` → `Supplier`

3. **Inventory Items** (Platform Items ↔ ERPNext Items)
   - Push: Creates/updates ERPNext Item
   - Pull: Creates/updates platform inventory item
   - Mapping: `inventory_item` → `Item`

4. **Journal Entries** (Platform Journal Entries ↔ ERPNext Journal Entries)
   - Push: Creates/updates ERPNext Journal Entry with debit/credit lines
   - Mapping: `journal_entry` → `Journal Entry`

### 🚧 Partially Implemented (Commented Out)

5. **Sales Invoices** (Platform Orders ↔ ERPNext Sales Invoices)
   - Status: Disabled - requires `orders` table implementation
   - Mapping: `order` → `Sales Invoice`

6. **Payments** (Platform Payments ↔ ERPNext Payment Entries)
   - Status: Disabled - requires `payments` table implementation
   - Mapping: `payment` → `Payment Entry`

## Troubleshooting

### Connection Errors

**Error**: `Connection test failed`

**Solutions**:
1. Verify ERPNext URL is correct (no trailing slash)
2. Check API credentials are valid
3. Ensure ERPNext instance is accessible from your app server
4. Check firewall rules allow outbound HTTPS connections

### Authentication Errors

**Error**: `401 Unauthorized`

**Solutions**:
1. Regenerate API keys in ERPNext
2. Verify API user has required permissions
3. Check API key format: `token api_key:api_secret`

### Sync Errors

**Error**: `Entity not found`

**Solutions**:
1. Verify the entity exists in the source system
2. Check entity ID is correct
3. Review sync logs for detailed error messages

**Error**: `Duplicate entry`

**Solutions**:
1. Check if entity already exists in target system
2. Review entity mappings table
3. Consider using conflict resolution settings

### Performance Issues

**Problem**: Sync takes too long

**Solutions**:
1. Use incremental sync with `lastSyncTime` parameter
2. Sync entities in smaller batches
3. Enable async queue processing
4. Schedule syncs during off-peak hours

## Best Practices

### 1. Initial Setup
- Start with a test ERPNext instance
- Sync a small dataset first
- Verify mappings are correct
- Test both push and pull operations

### 2. Data Quality
- Clean up duplicate records before syncing
- Ensure required fields are populated
- Validate email addresses and phone numbers
- Use consistent naming conventions

### 3. Security
- Store API credentials securely (use environment variables or encrypted storage)
- Rotate API keys regularly
- Use HTTPS for all API calls
- Implement rate limiting

### 4. Monitoring
- Set up alerts for sync failures
- Review sync logs regularly
- Monitor conflict resolution queue
- Track sync performance metrics

### 5. Conflict Resolution
- Define clear rules for each entity type
- Document conflict resolution policies
- Train users on manual conflict resolution
- Review and update resolution rules periodically

## Advanced Configuration

### Scheduled Sync

Enable automatic sync using the scheduler:

```typescript
import { ERPNextSyncScheduler } from './server/cron/erpnext-sync-scheduler';

const scheduler = new ERPNextSyncScheduler({
  enabled: true,
  interval: 30, // minutes
  entities: ['customer', 'supplier', 'item']
});

await scheduler.start();
```

### Webhook Integration

Set up webhooks in ERPNext to trigger real-time sync:

1. In ERPNext, go to **Webhook List**
2. Create new webhook for each entity
3. Set webhook URL to: `https://your-app-domain.com/api/webhooks/erpnext`
4. Configure events: `on_update`, `after_insert`
5. Add authentication headers

### Custom Field Mapping

Extend the sync service to map custom fields:

```typescript
// In erpnext-sync-service.ts
const customerData = {
  doctype: 'Customer',
  customer_name: user.name,
  // Add custom fields
  custom_field_1: user.customField1,
  custom_field_2: user.customField2
};
```

## Support

For issues or questions:
1. Check the sync logs for detailed error messages
2. Review ERPNext API documentation: https://frappeframework.com/docs/user/en/api
3. Contact your system administrator
4. File an issue in the project repository

## Next Steps

After successful integration:
1. ✅ Test all sync operations thoroughly
2. ✅ Set up monitoring and alerts
3. ✅ Train users on the integration
4. ✅ Document any custom configurations
5. ✅ Plan for ongoing maintenance and updates
