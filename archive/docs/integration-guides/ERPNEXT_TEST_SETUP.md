# ERPNext Test Environment Setup Guide

This guide provides comprehensive instructions for setting up a local ERPNext instance for testing the bidirectional synchronization integration.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start with Docker](#quick-start-with-docker)
3. [Manual Installation](#manual-installation)
4. [Generating API Keys](#generating-api-keys)
5. [Creating Test Data](#creating-test-data)
6. [Testing the Integration](#testing-the-integration)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

- **Operating System**: Ubuntu 20.04/22.04 LTS, macOS, or Windows with WSL2
- **RAM**: Minimum 4GB (8GB recommended)
- **Disk Space**: Minimum 10GB free space
- **Docker**: Version 20.10+ (for Docker installation method)
- **Python**: Version 3.10+ (for manual installation)
- **Node.js**: Version 16+ (for manual installation)

### Required Software

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y git python3-dev python3-pip redis-server mariadb-server

# macOS (using Homebrew)
brew install git python redis mariadb
```

---

## Quick Start with Docker

The fastest way to get ERPNext running for testing is using Docker Compose.

### Step 1: Clone ERPNext Docker Repository

```bash
git clone https://github.com/frappe/frappe_docker.git
cd frappe_docker
```

### Step 2: Create Docker Compose Configuration

Create a `docker-compose.yml` file:

```yaml
version: "3"

services:
  backend:
    image: frappe/erpnext:v14.latest
    deploy:
      restart_policy:
        condition: on-failure
    volumes:
      - sites:/home/frappe/frappe-bench/sites
      - logs:/home/frappe/frappe-bench/logs

  configurator:
    image: frappe/erpnext:v14.latest
    deploy:
      restart_policy:
        condition: none
    entrypoint:
      - bash
      - -c
    command:
      - >
        bench set-config -g db_host mariadb;
        bench set-config -gp db_port 3306;
        bench set-config -g redis_cache "redis://redis-cache:6379";
        bench set-config -g redis_queue "redis://redis-queue:6379";
        bench set-config -g redis_socketio "redis://redis-socketio:6379";
        bench set-config -gp socketio_port 9000;
    volumes:
      - sites:/home/frappe/frappe-bench/sites
      - logs:/home/frappe/frappe-bench/logs

  create-site:
    image: frappe/erpnext:v14.latest
    deploy:
      restart_policy:
        condition: none
    volumes:
      - sites:/home/frappe/frappe-bench/sites
      - logs:/home/frappe/frappe-bench/logs
    entrypoint:
      - bash
      - -c
    command:
      - >
        wait-for-it -t 120 mariadb:3306;
        wait-for-it -t 120 redis-cache:6379;
        wait-for-it -t 120 redis-queue:6379;
        wait-for-it -t 120 redis-socketio:6379;
        export start=`date +%s`;
        until [[ -n `grep -hs ^ sites/common_site_config.json | jq -r ".db_host // empty"` ]] && \
          [[ -n `grep -hs ^ sites/common_site_config.json | jq -r ".redis_cache // empty"` ]] && \
        [[ -n `grep -hs ^ sites/common_site_config.json | jq -r ".redis_queue // empty"` ]];
        do
          echo "Waiting for sites/common_site_config.json to be created";
          sleep 5;
          if (( `date +%s`-start > 120 )); then
            echo "could not find sites/common_site_config.json with required keys";
            exit 1
          fi
        done;
        echo "sites/common_site_config.json found";
        bench new-site frontend --no-mariadb-socket --admin-password=admin --db-root-password=admin --install-app erpnext --set-default;

  frontend:
    image: frappe/erpnext:v14.latest
    deploy:
      restart_policy:
        condition: on-failure
    command:
      - nginx-entrypoint.sh
    environment:
      BACKEND: backend:8000
      FRAPPE_SITE_NAME_HEADER: frontend
      SOCKETIO: websocket:9000
      UPSTREAM_REAL_IP_ADDRESS: 127.0.0.1
      UPSTREAM_REAL_IP_HEADER: X-Forwarded-For
      UPSTREAM_REAL_IP_RECURSIVE: "off"
    volumes:
      - sites:/home/frappe/frappe-bench/sites
      - logs:/home/frappe/frappe-bench/logs
    ports:
      - "8080:8080"

  websocket:
    image: frappe/erpnext:v14.latest
    deploy:
      restart_policy:
        condition: on-failure
    command:
      - node
      - /home/frappe/frappe-bench/apps/frappe/socketio.js
    volumes:
      - sites:/home/frappe/frappe-bench/sites
      - logs:/home/frappe/frappe-bench/logs

  queue-short:
    image: frappe/erpnext:v14.latest
    deploy:
      restart_policy:
        condition: on-failure
    command:
      - bench
      - worker
      - --queue
      - short,default
    volumes:
      - sites:/home/frappe/frappe-bench/sites
      - logs:/home/frappe/frappe-bench/logs

  queue-long:
    image: frappe/erpnext:v14.latest
    deploy:
      restart_policy:
        condition: on-failure
    command:
      - bench
      - worker
      - --queue
      - long,default,short
    volumes:
      - sites:/home/frappe/frappe-bench/sites
      - logs:/home/frappe/frappe-bench/logs

  scheduler:
    image: frappe/erpnext:v14.latest
    deploy:
      restart_policy:
        condition: on-failure
    command:
      - bench
      - schedule
    volumes:
      - sites:/home/frappe/frappe-bench/sites
      - logs:/home/frappe/frappe-bench/logs

  mariadb:
    image: mariadb:10.6
    healthcheck:
      test: mysqladmin ping -h localhost --password=admin
      interval: 1s
      retries: 15
    deploy:
      restart_policy:
        condition: on-failure
    command:
      - --character-set-server=utf8mb4
      - --collation-server=utf8mb4_unicode_ci
      - --skip-character-set-client-handshake
      - --skip-innodb-read-only-compressed
    environment:
      MYSQL_ROOT_PASSWORD: admin
    volumes:
      - mariadb-data:/var/lib/mysql

  redis-cache:
    image: redis:6.2-alpine
    deploy:
      restart_policy:
        condition: on-failure
    volumes:
      - redis-cache-data:/data

  redis-queue:
    image: redis:6.2-alpine
    deploy:
      restart_policy:
        condition: on-failure
    volumes:
      - redis-queue-data:/data

  redis-socketio:
    image: redis:6.2-alpine
    deploy:
      restart_policy:
        condition: on-failure
    volumes:
      - redis-socketio-data:/data

volumes:
  mariadb-data:
  redis-cache-data:
  redis-queue-data:
  redis-socketio-data:
  sites:
  logs:
```

### Step 3: Start ERPNext

```bash
docker-compose up -d
```

Wait for all services to start (this may take 5-10 minutes on first run).

### Step 4: Access ERPNext

Open your browser and navigate to:

```
http://localhost:8080
```

**Default Credentials:**
- Username: `Administrator`
- Password: `admin`

---

## Manual Installation

For production-like testing or if you prefer manual installation:

### Step 1: Install Frappe Bench

```bash
# Install bench CLI
sudo pip3 install frappe-bench

# Create a new bench
bench init frappe-bench --frappe-branch version-14
cd frappe-bench
```

### Step 2: Create a New Site

```bash
# Create site
bench new-site erpnext.local --admin-password admin

# Set as default site
bench use erpnext.local
```

### Step 3: Install ERPNext App

```bash
# Get ERPNext app
bench get-app erpnext --branch version-14

# Install ERPNext on site
bench --site erpnext.local install-app erpnext
```

### Step 4: Start Development Server

```bash
# Start bench
bench start
```

Access ERPNext at `http://localhost:8000`

---

## Generating API Keys

To enable API access for synchronization, you need to generate API keys.

### Method 1: Through Web Interface

1. Log in to ERPNext as Administrator
2. Go to **User** → **Administrator**
3. Scroll down to **API Access** section
4. Click **Generate Keys**
5. Copy the **API Key** and **API Secret** (save them securely!)

### Method 2: Using Bench Console

```bash
# Enter bench console
bench --site erpnext.local console

# Generate API keys for Administrator
from frappe.core.doctype.user.user import generate_keys
generate_keys("Administrator")
frappe.db.commit()

# Get the keys
user = frappe.get_doc("User", "Administrator")
print(f"API Key: {user.api_key}")
print(f"API Secret: {user.get_password('api_secret')}")
```

### Method 3: Create a Dedicated API User

```bash
# Create a new user for API access
bench --site erpnext.local console

# In the console:
user = frappe.new_doc("User")
user.email = "api@example.com"
user.first_name = "API"
user.last_name = "User"
user.send_welcome_email = 0
user.insert(ignore_permissions=True)

# Add roles
user.add_roles("System Manager", "Sales Manager", "Purchase Manager", "Accounts Manager")

# Generate API keys
from frappe.core.doctype.user.user import generate_keys
generate_keys(user.name)
frappe.db.commit()

# Get keys
print(f"API Key: {user.api_key}")
print(f"API Secret: {user.get_password('api_secret')}")
```

---

## Creating Test Data

### Using ERPNext Web Interface

#### 1. Create Customers

1. Go to **Selling** → **Customer**
2. Click **New**
3. Fill in:
   - Customer Name: `Test Customer 1`
   - Customer Group: `Individual`
   - Territory: `All Territories`
   - Email: `customer1@test.com`
   - Mobile: `+1234567890`
4. Save

Repeat for multiple customers.

#### 2. Create Suppliers

1. Go to **Buying** → **Supplier**
2. Click **New**
3. Fill in:
   - Supplier Name: `Test Supplier 1`
   - Supplier Group: `All Supplier Groups`
   - Email: `supplier1@test.com`
4. Save

#### 3. Create Items

1. Go to **Stock** → **Item**
2. Click **New**
3. Fill in:
   - Item Code: `ITEM-001`
   - Item Name: `Test Product 1`
   - Item Group: `Products`
   - Stock UOM: `Nos`
   - Is Stock Item: ✓
4. Save

#### 4. Create Sales Invoices

1. Go to **Accounts** → **Sales Invoice**
2. Click **New**
3. Fill in:
   - Customer: Select a customer
   - Posting Date: Today
   - Items: Add items with quantity and rate
4. Submit

### Using Python Script

Create a file `scripts/create-erpnext-test-data.py`:

```python
#!/usr/bin/env python3
"""
ERPNext Test Data Generator
Creates sample data for testing synchronization
"""

import frappe
from frappe.utils import nowdate

def create_customers():
    """Create test customers"""
    customers = [
        {"customer_name": "John Farmer", "email": "john@farm.com", "mobile": "+1234567890"},
        {"customer_name": "Jane Grower", "email": "jane@farm.com", "mobile": "+1234567891"},
        {"customer_name": "Bob Rancher", "email": "bob@ranch.com", "mobile": "+1234567892"},
    ]
    
    for cust_data in customers:
        if not frappe.db.exists("Customer", {"email_id": cust_data["email"]}):
            customer = frappe.new_doc("Customer")
            customer.customer_name = cust_data["customer_name"]
            customer.customer_type = "Individual"
            customer.customer_group = "Individual"
            customer.territory = "All Territories"
            customer.email_id = cust_data["email"]
            customer.mobile_no = cust_data["mobile"]
            customer.insert(ignore_permissions=True)
            print(f"Created customer: {customer.name}")

def create_suppliers():
    """Create test suppliers"""
    suppliers = [
        {"supplier_name": "Seed Supplier Co", "email": "seeds@supplier.com"},
        {"supplier_name": "Fertilizer Inc", "email": "fertilizer@supplier.com"},
        {"supplier_name": "Equipment Rentals", "email": "equipment@supplier.com"},
    ]
    
    for supp_data in suppliers:
        if not frappe.db.exists("Supplier", {"email_id": supp_data["email"]}):
            supplier = frappe.new_doc("Supplier")
            supplier.supplier_name = supp_data["supplier_name"]
            supplier.supplier_group = "All Supplier Groups"
            supplier.supplier_type = "Company"
            supplier.email_id = supp_data["email"]
            supplier.insert(ignore_permissions=True)
            print(f"Created supplier: {supplier.name}")

def create_items():
    """Create test items"""
    items = [
        {"item_code": "CORN-001", "item_name": "Corn Seeds", "rate": 50},
        {"item_code": "WHEAT-001", "item_name": "Wheat Seeds", "rate": 45},
        {"item_code": "FERT-001", "item_name": "Organic Fertilizer", "rate": 100},
        {"item_code": "PEST-001", "item_name": "Pesticide Spray", "rate": 75},
    ]
    
    for item_data in items:
        if not frappe.db.exists("Item", item_data["item_code"]):
            item = frappe.new_doc("Item")
            item.item_code = item_data["item_code"]
            item.item_name = item_data["item_name"]
            item.item_group = "Products"
            item.stock_uom = "Nos"
            item.is_stock_item = 1
            item.valuation_rate = item_data["rate"]
            item.insert(ignore_permissions=True)
            print(f"Created item: {item.name}")

def create_sales_invoices():
    """Create test sales invoices"""
    customers = frappe.get_all("Customer", limit=3)
    items = frappe.get_all("Item", limit=2)
    
    if not customers or not items:
        print("Please create customers and items first")
        return
    
    for customer in customers:
        invoice = frappe.new_doc("Sales Invoice")
        invoice.customer = customer.name
        invoice.posting_date = nowdate()
        invoice.due_date = nowdate()
        
        for item in items:
            invoice.append("items", {
                "item_code": item.name,
                "qty": 10,
                "rate": 100
            })
        
        invoice.insert(ignore_permissions=True)
        invoice.submit()
        print(f"Created sales invoice: {invoice.name}")

def main():
    """Main function"""
    print("Creating test data in ERPNext...")
    
    create_customers()
    create_suppliers()
    create_items()
    create_sales_invoices()
    
    frappe.db.commit()
    print("\nTest data creation completed!")

if __name__ == "__main__":
    frappe.init(site="erpnext.local")
    frappe.connect()
    main()
```

Run the script:

```bash
cd frappe-bench
bench --site erpnext.local execute scripts/create-erpnext-test-data.py
```

---

## Testing the Integration

### Step 1: Configure ERPNext Connection in Platform

1. Log in to your Farmer Data Collection platform
2. Navigate to **Admin** → **ERPNext Integration**
3. Enter:
   - ERPNext URL: `http://localhost:8080` (or your ERPNext URL)
   - API Key: (from earlier step)
   - API Secret: (from earlier step)
4. Click **Test Connection**
5. If successful, click **Save Configuration**

### Step 2: Configure Sync Settings

1. Enable sync for each entity type:
   - ✓ Customers
   - ✓ Suppliers
   - ✓ Items
   - ✓ Invoices
   - ✓ Payments
2. Set sync direction: **Both** (bidirectional)
3. Set conflict resolution: **ERPNext Wins**

### Step 3: Trigger Manual Sync

1. Click **Sync All** button
2. Monitor sync progress in the dashboard
3. Check sync logs for any errors

### Step 4: Verify Data

1. Check that ERPNext customers appear in platform users
2. Check that platform inventory items appear in ERPNext
3. Verify bidirectional sync by:
   - Creating a customer in ERPNext → Pull sync → Check platform
   - Creating an item in platform → Push sync → Check ERPNext

---

## Troubleshooting

### Connection Issues

**Problem**: Cannot connect to ERPNext

**Solutions**:
1. Check ERPNext is running: `docker-compose ps` or `bench status`
2. Verify URL is correct (include `http://` or `https://`)
3. Check firewall rules allow connection
4. Test API manually:
   ```bash
   curl -X GET "http://localhost:8080/api/method/frappe.auth.get_logged_user" \
     -H "Authorization: token API_KEY:API_SECRET"
   ```

### Authentication Errors

**Problem**: 401 Unauthorized or 403 Forbidden

**Solutions**:
1. Regenerate API keys
2. Verify API user has correct roles (System Manager, Sales Manager, etc.)
3. Check API key/secret are not expired
4. Ensure no extra spaces in API credentials

### Sync Failures

**Problem**: Sync completes but no data appears

**Solutions**:
1. Check sync logs for specific errors
2. Verify entity mappings in database
3. Check ERPNext permissions for API user
4. Enable debug logging in sync service
5. Check database constraints (unique keys, foreign keys)

### Data Conflicts

**Problem**: Duplicate records or conflicts

**Solutions**:
1. Clear entity mappings table
2. Set conflict resolution strategy
3. Use incremental sync with timestamps
4. Manually resolve conflicts in conflicts table

### Performance Issues

**Problem**: Sync is very slow

**Solutions**:
1. Use incremental sync instead of full sync
2. Increase batch size in sync configuration
3. Add database indexes on frequently queried fields
4. Run sync during off-peak hours
5. Consider using sync queue for large datasets

---

## Additional Resources

- [ERPNext Documentation](https://docs.erpnext.com/)
- [Frappe Framework API](https://frappeframework.com/docs/user/en/api)
- [ERPNext REST API Guide](https://frappeframework.com/docs/user/en/api/rest)
- [ERPNext Docker Repository](https://github.com/frappe/frappe_docker)

---

## Support

For issues specific to the integration:
1. Check sync logs in the platform
2. Review ERPNext error logs: `tail -f frappe-bench/logs/erpnext.log`
3. Enable debug mode in both systems
4. Contact platform support with:
   - Sync log entries
   - ERPNext version
   - Error messages
   - Steps to reproduce

---

**Last Updated**: 2025-11-29
**ERPNext Version**: 14.x
**Platform Version**: 1.0.0
