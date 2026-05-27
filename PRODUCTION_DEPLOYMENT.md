# Production Deployment Guide

## Overview

This document provides comprehensive instructions for deploying the Farmer Data Collection Platform to production.

## System Requirements

### Minimum Requirements
- **CPU**: 4 cores
- **RAM**: 8GB
- **Storage**: 50GB SSD
- **OS**: Ubuntu 22.04 LTS or later
- **Node.js**: 22.13.0
- **PostgreSQL**: 14 or later

### Recommended Requirements
- **CPU**: 8 cores
- **RAM**: 16GB
- **Storage**: 100GB SSD
- **Database**: Managed PostgreSQL (AWS RDS, Google Cloud SQL, or Azure Database)

## Pre-Deployment Checklist

### 1. Database Setup

#### Option A: Managed PostgreSQL (Recommended)
```bash
# Example for AWS RDS
# 1. Create PostgreSQL 14+ instance
# 2. Configure security group to allow connections from app servers
# 3. Note down connection details:
#    - Host: xxx.rds.amazonaws.com
#    - Port: 5432
#    - Database: farmer_data
#    - Username: farmer_admin
#    - Password: <secure-password>
```

#### Option B: Self-Hosted PostgreSQL
```bash
# Install PostgreSQL
sudo apt update
sudo apt install postgresql-14 postgresql-contrib

# Create database and user
sudo -u postgres psql
CREATE DATABASE farmer_data;
CREATE USER farmer_admin WITH ENCRYPTED PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE farmer_data TO farmer_admin;
\q

# Configure PostgreSQL for remote connections
sudo nano /etc/postgresql/14/main/postgresql.conf
# Set: listen_addresses = '*'

sudo nano /etc/postgresql/14/main/pg_hba.conf
# Add: host all all 0.0.0.0/0 md5

sudo systemctl restart postgresql
```

### 2. Environment Variables

Create a `.env` file with the following variables:

```bash
# Database Configuration
DATABASE_URL=postgresql://farmer_admin:password@localhost:5432/farmer_data

# JWT Configuration
JWT_SECRET=<generate-with-openssl-rand-base64-32>

# Server Configuration
NODE_ENV=production
PORT=3000

# CORS Configuration
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Optional: Redis Configuration (for caching)
REDIS_URL=redis://localhost:6379

# Optional: Kafka Configuration (for event streaming)
KAFKA_BROKERS=localhost:9092

# Optional: Keycloak Configuration (for enterprise auth)
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=farmer-realm
KEYCLOAK_CLIENT_ID=farmer-api
KEYCLOAK_CLIENT_SECRET=<your-client-secret>

# Optional: Africa's Talking SMS (for SMS features)
AFRICAS_TALKING_API_KEY=<your-api-key>
AFRICAS_TALKING_USERNAME=<your-username>

# Optional: ERPNext Integration
ERPNEXT_URL=https://your-erpnext-instance.com
ERPNEXT_API_KEY=<your-api-key>
ERPNEXT_API_SECRET=<your-api-secret>

# Optional: Stripe Integration
STRIPE_SECRET_KEY=<your-stripe-secret-key>
STRIPE_WEBHOOK_SECRET=<your-webhook-secret>
VITE_STRIPE_PUBLISHABLE_KEY=<your-publishable-key>
```

### 3. Generate JWT Secret

```bash
openssl rand -base64 32
```

### 4. SSL/TLS Certificates

#### Using Let's Encrypt (Recommended)
```bash
# Install Certbot
sudo apt install certbot

# Generate certificate
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Certificates will be saved to:
# /etc/letsencrypt/live/yourdomain.com/fullchain.pem
# /etc/letsencrypt/live/yourdomain.com/privkey.pem
```

## Deployment Steps

### 1. Install Dependencies

```bash
# Clone repository
git clone <your-repo-url>
cd farmer-data-collection

# Install Node.js dependencies
npm install -g pnpm
pnpm install
```

### 2. Database Migration

```bash
# Run all database migrations
node setup-all-tables.mjs

# Verify tables were created
PGPASSWORD=<password> psql -h <host> -U farmer_admin -d farmer_data -c '\dt'
```

### 3. Build Application

```bash
# Build frontend and backend
pnpm build

# Output will be in:
# - client/dist (frontend)
# - dist (backend)
```

### 4. Start Production Server

#### Option A: Using PM2 (Recommended)
```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start dist/index.js --name farmer-app

# Configure PM2 to start on boot
pm2 startup
pm2 save

# Monitor application
pm2 logs farmer-app
pm2 monit
```

#### Option B: Using systemd
```bash
# Create systemd service file
sudo nano /etc/systemd/system/farmer-app.service
```

```ini
[Unit]
Description=Farmer Data Collection Platform
After=network.target postgresql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/farmer-data-collection
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /home/ubuntu/farmer-data-collection/dist/index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start service
sudo systemctl enable farmer-app
sudo systemctl start farmer-app
sudo systemctl status farmer-app
```

### 5. Configure Nginx Reverse Proxy

```bash
# Install Nginx
sudo apt install nginx

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/farmer-app
```

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Frontend static files
    location / {
        root /home/ubuntu/farmer-data-collection/client/dist;
        try_files $uri $uri/ /index.html;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API proxy
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:3000/api/trpc/health.check;
        access_log off;
    }
}
```

```bash
# Enable site and restart Nginx
sudo ln -s /etc/nginx/sites-available/farmer-app /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 6. Configure Firewall

```bash
# Allow HTTP, HTTPS, and SSH
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Post-Deployment Tasks

### 1. Database Backups

```bash
# Create backup script
sudo nano /usr/local/bin/backup-farmer-db.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/farmer-db"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

pg_dump -h localhost -U farmer_admin farmer_data | gzip > $BACKUP_DIR/farmer_data_$DATE.sql.gz

# Keep only last 30 days of backups
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete
```

```bash
# Make executable
sudo chmod +x /usr/local/bin/backup-farmer-db.sh

# Add to crontab (daily at 2 AM)
sudo crontab -e
0 2 * * * /usr/local/bin/backup-farmer-db.sh
```

### 2. Monitoring Setup

```bash
# Install monitoring tools
sudo apt install htop iotop nethogs

# Monitor application logs
pm2 logs farmer-app --lines 100

# Monitor system resources
htop
```

### 3. Health Check Monitoring

Set up automated health checks using a monitoring service (e.g., UptimeRobot, Pingdom):

- **Endpoint**: `https://yourdomain.com/health`
- **Interval**: 5 minutes
- **Alert**: Email/SMS on failure

### 4. SSL Certificate Renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Auto-renewal is configured by default via cron
# Verify: sudo systemctl status certbot.timer
```

## Scaling Considerations

### Horizontal Scaling

1. **Load Balancer**: Use Nginx or HAProxy to distribute traffic
2. **Multiple App Instances**: Run multiple PM2 instances
3. **Database Read Replicas**: For read-heavy workloads
4. **CDN**: Use CloudFront or Cloudflare for static assets

### Vertical Scaling

1. **Increase server resources** (CPU, RAM)
2. **Optimize database** (indexes, query optimization)
3. **Enable caching** (Redis)
4. **Database connection pooling**

## Troubleshooting

### Application Won't Start

```bash
# Check logs
pm2 logs farmer-app
journalctl -u farmer-app -n 100

# Verify environment variables
pm2 env 0

# Check database connection
PGPASSWORD=<password> psql -h <host> -U farmer_admin -d farmer_data -c 'SELECT 1'
```

### High Memory Usage

```bash
# Check memory usage
pm2 monit

# Restart application
pm2 restart farmer-app

# Optimize Node.js memory
pm2 start dist/index.js --name farmer-app --max-memory-restart 1G
```

### Database Connection Errors

```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check connection limits
PGPASSWORD=<password> psql -h <host> -U farmer_admin -d farmer_data -c 'SHOW max_connections'

# Increase connection pool size in code if needed
```

## Security Best Practices

1. **Keep dependencies updated**: `pnpm update`
2. **Use strong passwords**: Minimum 16 characters
3. **Enable database SSL**: Add `?sslmode=require` to DATABASE_URL
4. **Regular security audits**: `pnpm audit`
5. **Implement rate limiting**: Already configured in application
6. **Monitor logs**: Set up log aggregation (e.g., ELK stack)
7. **Backup encryption**: Encrypt database backups
8. **Access control**: Use VPN or IP whitelisting for admin access

## Maintenance

### Regular Tasks

- **Daily**: Monitor logs and health checks
- **Weekly**: Review database performance
- **Monthly**: Update dependencies and security patches
- **Quarterly**: Review and update SSL certificates
- **Annually**: Disaster recovery drill

### Update Procedure

```bash
# Backup database
/usr/local/bin/backup-farmer-db.sh

# Pull latest code
git pull origin main

# Install dependencies
pnpm install

# Build application
pnpm build

# Restart application
pm2 restart farmer-app

# Verify deployment
curl https://yourdomain.com/health
```

## Support

For production support:
- **Documentation**: https://help.manus.im
- **Issues**: Submit at https://help.manus.im

## Appendix

### Database Schema

Current database has 28 tables:
- Core: users, farmers, farms, crops, livestock, farm_inputs, harvests, expenses
- Microfinance: loans, loan_applications, loan_repayments, lenders, credit_scores
- SMS: sms_templates, sms_scheduled_messages, sms_logs, sms_responses, sms_delivery_logs
- ERPNext: erpnext_config, erpnext_sync_mapping, erpnext_sync_log, erpnext_sync_queue, erpnext_sync_conflicts, erpnext_conflicts, erpnext_entity_mappings, erpnext_sync_config, erpnext_sync_logs
- Notifications: user_notification_preferences

### API Endpoints

All API endpoints are available via tRPC at `/api/trpc/*`:

**Authentication**:
- `auth.register` - User registration
- `auth.login` - User login
- `auth.me` - Get current user

**Health Checks**:
- `health.check` - Comprehensive health status
- `health.database` - Database health
- `health.ready` - Readiness probe
- `health.alive` - Liveness probe

**Data Management**:
- `dashboard.*` - Dashboard statistics
- `farmers.*` - Farmer management
- `farms.*` - Farm management
- `crops.*` - Crop tracking
- `livestock.*` - Livestock management
- `harvests.*` - Harvest records
- `expenses.*` - Expense tracking

**Advanced Features**:
- `microfinance.*` - Loan management
- `sms.*` - SMS messaging
- `erpnext.*` - ERPNext integration
- `marketplace.*` - Product marketplace
- `analytics.*` - Analytics and reporting

### Performance Benchmarks

Expected performance metrics:
- **API Response Time**: < 200ms (p95)
- **Database Query Time**: < 50ms (p95)
- **Health Check**: < 100ms
- **Concurrent Users**: 1000+
- **Requests per Second**: 500+

### Disaster Recovery

**Recovery Time Objective (RTO)**: 4 hours
**Recovery Point Objective (RPO)**: 24 hours

**Recovery Steps**:
1. Restore database from latest backup
2. Deploy application from Git repository
3. Configure environment variables
4. Start services
5. Verify health checks
6. Update DNS if needed
