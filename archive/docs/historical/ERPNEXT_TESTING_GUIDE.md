# ERPNext Integration Testing Guide

## Overview

This guide provides step-by-step instructions for testing the ERPNext integration to ensure it works correctly with your ERPNext instance.

## Prerequisites

Before testing:
- ✅ ERPNext instance is running and accessible
- ✅ API credentials have been generated
- ✅ Database migrations have been applied
- ✅ Configuration has been added to `erpnext_config` table

## Testing Checklist

### Phase 1: Connection Testing

#### Test 1.1: Basic Connectivity

**Objective**: Verify the app can reach the ERPNext instance.

**Steps**:
1. Open your terminal
2. Run the connection test:
```bash
curl -X POST https://your-app-domain.com/api/trpc/erpnext.testConnection \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{}'
```

**Expected Result**:
```json
{
  "success": true,
  "message": "Successfully connected to ERPNext"
}
```

**If it fails**:
- Check ERPNext URL is correct
- Verify network connectivity
- Check firewall rules
- Verify API credentials

---

#### Test 1.2: API Authentication

**Objective**: Verify API credentials are valid.

**Steps**:
1. In ERPNext, go to User List
2. Find the API user
3. Verify "API Access" is enabled
4. Check API Key and Secret match your configuration

**Expected Result**: API user should have "API Access" enabled

---

### Phase 2: Pull Sync Testing

#### Test 2.1: Pull Customers

**Objective**: Import customers from ERPNext to platform.

**Prerequisites**:
- At least 1 customer exists in ERPNext
- Customer has a valid email address

**Steps**:
1. Note the number of users in your platform database:
```sql
SELECT COUNT(*) FROM users;
```

2. Run the pull sync:
```bash
curl -X POST https://your-app-domain.com/api/trpc/erpnext.sync \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "entityType": "customer",
    "direction": "pull"
  }'
```

3. Check the response for success:
```json
{
  "success": true,
  "message": "Sync completed for customer",
  "result": {
    "success": true,
    "recordsProcessed": 5,
    "recordsCreated": 5,
    "recordsUpdated": 0,
    "recordsFailed": 0,
    "errors": []
  }
}
```

4. Verify users were created:
```sql
SELECT COUNT(*) FROM users;
-- Should be increased by recordsCreated count
```

5. Check entity mappings:
```sql
SELECT * FROM erpnext_sync_mapping 
WHERE entity_type = 'customer'
ORDER BY created_at DESC
LIMIT 5;
```

**Expected Result**:
- `recordsCreated` matches number of new customers
- New users exist in `users` table
- Mappings exist in `erpnext_sync_mapping` table
- No errors in response

---

#### Test 2.2: Pull Suppliers

**Objective**: Import suppliers from ERPNext to platform.

**Prerequisites**:
- At least 1 supplier exists in ERPNext

**Steps**:
1. Note the number of suppliers:
```sql
SELECT COUNT(*) FROM suppliers;
```

2. Run the pull sync:
```bash
curl -X POST https://your-app-domain.com/api/trpc/erpnext.sync \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "entityType": "supplier",
    "direction": "pull"
  }'
```

3. Verify suppliers were created:
```sql
SELECT * FROM suppliers ORDER BY created_at DESC LIMIT 5;
```

4. Check mappings:
```sql
SELECT * FROM erpnext_sync_mapping 
WHERE entity_type = 'supplier'
ORDER BY created_at DESC;
```

**Expected Result**:
- New suppliers exist in database
- Mappings are correct
- Supplier details match ERPNext data

---

#### Test 2.3: Pull Items

**Objective**: Import inventory items from ERPNext to platform.

**Prerequisites**:
- At least 1 item exists in ERPNext
- Item has stock UOM defined

**Steps**:
1. Note the number of items:
```sql
SELECT COUNT(*) FROM inventory_items;
```

2. Run the pull sync:
```bash
curl -X POST https://your-app-domain.com/api/trpc/erpnext.sync \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "entityType": "item",
    "direction": "pull"
  }'
```

3. Verify items were created:
```sql
SELECT * FROM inventory_items ORDER BY created_at DESC LIMIT 5;
```

4. Check item details:
```sql
SELECT 
  item_name,
  unit,
  quantity_on_hand,
  unit_cost
FROM inventory_items
WHERE created_at > NOW() - INTERVAL '1 hour';
```

**Expected Result**:
- Items imported successfully
- Unit costs are in cents (multiplied by 100)
- Mappings exist

---

#### Test 2.4: Incremental Pull

**Objective**: Test incremental sync using lastSyncTime.

**Steps**:
1. Get current timestamp:
```sql
SELECT NOW();
```

2. Update a customer in ERPNext:
   - Go to ERPNext Customer List
   - Edit a customer
   - Change the customer name
   - Save

3. Run incremental sync:
```bash
curl -X POST https://your-app-domain.com/api/trpc/erpnext.sync \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "entityType": "customer",
    "direction": "pull",
    "lastSyncTime": "2024-01-01T00:00:00Z"
  }'
```

4. Verify only modified customer was updated:
```sql
SELECT * FROM users 
WHERE updated_at > NOW() - INTERVAL '5 minutes'
ORDER BY updated_at DESC;
```

**Expected Result**:
- Only modified customer was synced
- `recordsUpdated` count matches expectations
- Customer name was updated in platform

---

### Phase 3: Push Sync Testing

#### Test 3.1: Push Customer

**Objective**: Create a customer in ERPNext from platform user.

**Prerequisites**:
- At least 1 user exists in platform
- User has valid email and name

**Steps**:
1. Get a user ID from your database:
```sql
SELECT id, email, first_name, last_name FROM users LIMIT 1;
```

2. Push the customer:
```bash
curl -X POST https://your-app-domain.com/api/trpc/erpnext.pushCustomer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"userId": "1"}'
```

3. Check response:
```json
{
  "success": true,
  "recordsProcessed": 1,
  "recordsCreated": 1,
  "recordsUpdated": 0,
  "recordsFailed": 0,
  "errors": []
}
```

4. Verify in ERPNext:
   - Go to Customer List
   - Search for the customer by email
   - Verify customer details match platform user

5. Check mapping was created:
```sql
SELECT * FROM erpnext_sync_mapping 
WHERE entity_type = 'user' AND platform_id = 1;
```

**Expected Result**:
- Customer created in ERPNext
- Mapping exists in database
- Customer details match platform user

---

#### Test 3.2: Push Supplier

**Objective**: Create a supplier in ERPNext from platform supplier.

**Steps**:
1. Get a supplier ID:
```sql
SELECT id, name, email, phone_number FROM suppliers LIMIT 1;
```

2. Push the supplier:
```bash
curl -X POST https://your-app-domain.com/api/trpc/erpnext.pushSupplier \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"supplierId": "1"}'
```

3. Verify in ERPNext:
   - Go to Supplier List
   - Find the supplier
   - Check details match

**Expected Result**:
- Supplier created in ERPNext
- Details are correct

---

#### Test 3.3: Push Item

**Objective**: Create an item in ERPNext from platform inventory item.

**Steps**:
1. Get an item ID:
```sql
SELECT id, item_name, unit, unit_cost FROM inventory_items LIMIT 1;
```

2. Push the item:
```bash
curl -X POST https://your-app-domain.com/api/trpc/erpnext.pushItem \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"itemId": "1"}'
```

3. Verify in ERPNext:
   - Go to Item List
   - Search for the item
   - Check unit cost is correct (should be divided by 100)

**Expected Result**:
- Item created in ERPNext
- Unit cost converted correctly from cents

---

#### Test 3.4: Update Existing Entity

**Objective**: Test updating an existing entity (not creating duplicate).

**Steps**:
1. Push a customer (Test 3.1)
2. Update the user in platform:
```sql
UPDATE users 
SET first_name = 'Updated', last_name = 'Name'
WHERE id = 1;
```

3. Push the same customer again:
```bash
curl -X POST https://your-app-domain.com/api/trpc/erpnext.pushCustomer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"userId": "1"}'
```

4. Check response shows update:
```json
{
  "recordsUpdated": 1,
  "recordsCreated": 0
}
```

5. Verify in ERPNext:
   - Customer name should be updated
   - No duplicate customer created

**Expected Result**:
- Existing customer updated
- No duplicate created
- `recordsUpdated` = 1, `recordsCreated` = 0

---

### Phase 4: Journal Entry Testing

#### Test 4.1: Push Journal Entry

**Objective**: Create a journal entry in ERPNext.

**Prerequisites**:
- Journal entry exists in platform with lines
- Account codes are valid in ERPNext

**Steps**:
1. Create a test journal entry:
```sql
-- Insert journal entry
INSERT INTO journal_entries (
  user_id, entry_number, entry_date, description, status
) VALUES (
  1, 'JE-TEST-001', NOW(), 'Test Journal Entry', 'posted'
) RETURNING id;

-- Insert debit line
INSERT INTO journal_entry_lines (
  journal_entry_id, account_code, debit, credit, description
) VALUES (
  1, '1000', 10000, 0, 'Debit entry'
);

-- Insert credit line
INSERT INTO journal_entry_lines (
  journal_entry_id, account_code, debit, credit, description
) VALUES (
  1, '2000', 0, 10000, 'Credit entry'
);
```

2. Push the journal entry:
```bash
curl -X POST https://your-app-domain.com/api/trpc/erpnext.pushJournalEntry \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"journalEntryId": "1"}'
```

3. Verify in ERPNext:
   - Go to Journal Entry List
   - Find the entry
   - Check debit and credit amounts
   - Verify accounts are correct

**Expected Result**:
- Journal entry created in ERPNext
- Debit and credit lines match
- Amounts converted correctly from cents

---

### Phase 5: Error Handling Testing

#### Test 5.1: Invalid Entity ID

**Objective**: Test error handling for non-existent entity.

**Steps**:
1. Push a customer with invalid ID:
```bash
curl -X POST https://your-app-domain.com/api/trpc/erpnext.pushCustomer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"userId": "99999"}'
```

**Expected Result**:
```json
{
  "success": false,
  "recordsFailed": 1,
  "errors": ["User 99999 not found"]
}
```

---

#### Test 5.2: Missing Required Fields

**Objective**: Test validation of required fields.

**Steps**:
1. Create a user without email:
```sql
INSERT INTO users (password, role) 
VALUES ('test', 'farmer')
RETURNING id;
```

2. Try to push the user:
```bash
curl -X POST https://your-app-domain.com/api/trpc/erpnext.pushCustomer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"userId": "NEW_ID"}'
```

**Expected Result**:
- Error about missing email
- No customer created in ERPNext

---

#### Test 5.3: Network Timeout

**Objective**: Test handling of network issues.

**Steps**:
1. Temporarily block ERPNext URL in firewall
2. Try to sync:
```bash
curl -X POST https://your-app-domain.com/api/trpc/erpnext.testConnection \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{}'
```

**Expected Result**:
- Timeout error after 30 seconds
- Error logged in `erpnext_sync_log`

---

### Phase 6: Full Sync Testing

#### Test 6.1: Perform Full Sync

**Objective**: Test complete bidirectional sync.

**Steps**:
1. Run full sync:
```bash
curl -X POST https://your-app-domain.com/api/trpc/erpnext.performFullSync \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{}'
```

2. Check response includes all entity types:
```json
{
  "pull": {
    "customers": {...},
    "suppliers": {...},
    "items": {...},
    "journalEntries": {...}
  }
}
```

3. Verify sync logs:
```sql
SELECT 
  operation,
  entity_type,
  status,
  error_message,
  created_at
FROM erpnext_sync_log
WHERE created_at > NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC;
```

**Expected Result**:
- All entities synced successfully
- Logs show all operations
- No errors

---

### Phase 7: Performance Testing

#### Test 7.1: Large Dataset Sync

**Objective**: Test sync performance with many records.

**Prerequisites**:
- 100+ customers in ERPNext

**Steps**:
1. Record start time
2. Pull all customers:
```bash
time curl -X POST https://your-app-domain.com/api/trpc/erpnext.sync \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "entityType": "customer",
    "direction": "pull"
  }'
```

3. Note the time taken
4. Check for timeouts or errors

**Expected Result**:
- Sync completes within reasonable time (< 5 minutes for 1000 records)
- No timeout errors
- All records processed

---

#### Test 7.2: Concurrent Sync

**Objective**: Test multiple simultaneous sync operations.

**Steps**:
1. Start 3 sync operations simultaneously:
```bash
# Terminal 1
curl -X POST .../erpnext.sync -d '{"entityType": "customer", "direction": "pull"}' &

# Terminal 2
curl -X POST .../erpnext.sync -d '{"entityType": "supplier", "direction": "pull"}' &

# Terminal 3
curl -X POST .../erpnext.sync -d '{"entityType": "item", "direction": "pull"}' &
```

2. Wait for all to complete
3. Check for errors or conflicts

**Expected Result**:
- All syncs complete successfully
- No database deadlocks
- No duplicate records

---

## Troubleshooting

### Common Issues

#### Issue: "Connection test failed"
**Solution**: Check ERPNext URL, network connectivity, and firewall rules

#### Issue: "401 Unauthorized"
**Solution**: Verify API credentials are correct and API user has permissions

#### Issue: "Duplicate entry"
**Solution**: Check entity mappings table for existing mappings

#### Issue: "Timeout"
**Solution**: Increase timeout value or sync in smaller batches

#### Issue: "Invalid account code"
**Solution**: Verify account codes exist in ERPNext Chart of Accounts

---

## Test Data Cleanup

After testing, clean up test data:

```sql
-- Delete test users
DELETE FROM users WHERE email LIKE '%test%';

-- Delete test suppliers
DELETE FROM suppliers WHERE name LIKE '%test%';

-- Delete test items
DELETE FROM inventory_items WHERE item_name LIKE '%test%';

-- Delete test journal entries
DELETE FROM journal_entries WHERE entry_number LIKE '%TEST%';

-- Delete sync mappings
DELETE FROM erpnext_sync_mapping WHERE created_at > NOW() - INTERVAL '1 hour';

-- Delete sync logs
DELETE FROM erpnext_sync_log WHERE created_at > NOW() - INTERVAL '1 hour';
```

In ERPNext:
1. Go to each doctype list (Customer, Supplier, Item, Journal Entry)
2. Filter by creation date (today)
3. Select test records
4. Delete selected records

---

## Test Report Template

Use this template to document your test results:

```markdown
# ERPNext Integration Test Report

**Date**: [Date]
**Tester**: [Name]
**Environment**: [Production/Staging/Development]
**ERPNext Version**: [Version]

## Test Results

### Phase 1: Connection Testing
- [ ] Test 1.1: Basic Connectivity - PASS/FAIL
- [ ] Test 1.2: API Authentication - PASS/FAIL

### Phase 2: Pull Sync Testing
- [ ] Test 2.1: Pull Customers - PASS/FAIL
- [ ] Test 2.2: Pull Suppliers - PASS/FAIL
- [ ] Test 2.3: Pull Items - PASS/FAIL
- [ ] Test 2.4: Incremental Pull - PASS/FAIL

### Phase 3: Push Sync Testing
- [ ] Test 3.1: Push Customer - PASS/FAIL
- [ ] Test 3.2: Push Supplier - PASS/FAIL
- [ ] Test 3.3: Push Item - PASS/FAIL
- [ ] Test 3.4: Update Existing Entity - PASS/FAIL

### Phase 4: Journal Entry Testing
- [ ] Test 4.1: Push Journal Entry - PASS/FAIL

### Phase 5: Error Handling Testing
- [ ] Test 5.1: Invalid Entity ID - PASS/FAIL
- [ ] Test 5.2: Missing Required Fields - PASS/FAIL
- [ ] Test 5.3: Network Timeout - PASS/FAIL

### Phase 6: Full Sync Testing
- [ ] Test 6.1: Perform Full Sync - PASS/FAIL

### Phase 7: Performance Testing
- [ ] Test 7.1: Large Dataset Sync - PASS/FAIL
- [ ] Test 7.2: Concurrent Sync - PASS/FAIL

## Issues Found

1. [Issue description]
   - Severity: High/Medium/Low
   - Steps to reproduce:
   - Expected result:
   - Actual result:

## Recommendations

1. [Recommendation]
2. [Recommendation]

## Sign-off

Tested by: _______________
Date: _______________
Approved by: _______________
Date: _______________
```

---

## Next Steps

After successful testing:
1. ✅ Document any custom configurations
2. ✅ Set up monitoring and alerts
3. ✅ Train users on the integration
4. ✅ Schedule regular sync operations
5. ✅ Plan for ongoing maintenance
