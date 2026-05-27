# Farmer Data Collection Platform - Production Deployment Guide

This guide covers deploying the Farmer Data Collection Platform to production with full monitoring, distributed tracing, and Africa's Talking integration.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Africa's Talking Setup](#africas-talking-setup)
3. [Environment Configuration](#environment-configuration)
4. [Docker Deployment](#docker-deployment)
5. [Monitoring Stack](#monitoring-stack)
6. [Distributed Tracing](#distributed-tracing)
7. [SSL/TLS Configuration](#ssltls-configuration)
8. [Scaling](#scaling)
9. [Backup & Recovery](#backup--recovery)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

- **OS**: Ubuntu 20.04+ or similar Linux distribution
- **CPU**: Minimum 4 cores (8+ recommended for production)
- **RAM**: Minimum 8GB (16GB+ recommended)
- **Storage**: Minimum 50GB SSD
- **Docker**: Version 20.10+
- **Docker Compose**: Version 2.0+

### Domain & DNS

- Domain name configured and pointing to your server
- SSL certificate (Let's Encrypt recommended)

### Third-Party Services

- **Africa's Talking Account**: For USSD, SMS, and WhatsApp
- **PostgreSQL**: Production database (can use Docker or managed service)
- **Redis**: Cache layer (can use Docker or managed service)

---

## Africa's Talking Setup

### 1. Create Account

1. Visit [Africa's Talking](https://africastalking.com/)
2. Sign up for an account
3. Complete verification process
4. Navigate to Dashboard

### 2. Get API Credentials

1. Go to **Settings** → **API Keys**
2. Generate a new API key
3. Save the API key securely
4. Note your username (usually your account email or custom username)

### 3. Configure USSD Shortcode

1. Go to **USSD** → **Create Channel**
2. Request a shortcode (e.g., `*384*1234#`)
3. Set callback URL: `https://yourdomain.com/api/trpc/africasTalking.ussdWebhook`
4. Wait for approval (usually 1-3 business days)

### 4. Configure SMS

1. Go to **SMS** → **Settings**
2. Set sender ID (your brand name, max 11 characters)
3. Set delivery report URL: `https://yourdomain.com/api/trpc/africasTalking.deliveryReportWebhook`
4. Set incoming SMS URL: `https://yourdomain.com/api/trpc/africasTalking.smsWebhook`

### 5. Configure WhatsApp

1. Go to **WhatsApp** → **Get Started**
2. Follow the WhatsApp Business API setup process
3. Set webhook URL: `https://yourdomain.com/api/trpc/africasTalking.whatsappWebhook`
4. Complete verification

---

## Environment Configuration

### 1. Create Environment File

Create `.env.production` in the project root:

```bash
# Node Environment
NODE_ENV=production
PORT=3000

# Database
DATABASE_URL=postgresql://user:password@postgres:5432/farmer_data
POSTGRES_USER=farmer_user
POSTGRES_PASSWORD=<STRONG_PASSWORD>
POSTGRES_DB=farmer_data

# Redis
REDIS_URL=redis://:redis_password@redis:6379
REDIS_PASSWORD=<STRONG_PASSWORD>

# JWT Authentication
JWT_SECRET=<GENERATE_STRONG_SECRET>

# Africa's Talking
AFRICAS_TALKING_API_KEY=<YOUR_API_KEY>
AFRICAS_TALKING_USERNAME=<YOUR_USERNAME>

# Microservices URLs
ORCHESTRATOR_URL=http://orchestrator:8086
TIGERBEETLE_URL=http://tigerbeetle:8084
LAKEHOUSE_URL=http://lakehouse:8085
OLLAMA_URL=http://ollama:8087
TEMPORAL_URL=temporal:7233
KAFKA_URL=kafka:9092
APISIX_URL=http://apisix:9080
KEYCLOAK_URL=http://keycloak:8180
PERMIFY_URL=http://permify:3476

# Monitoring
JAEGER_ENDPOINT=http://jaeger:14268/api/traces
SERVICE_NAME=farmer-backend
SERVICE_VERSION=1.0.0

# Grafana
GRAFANA_USER=admin
GRAFANA_PASSWORD=<STRONG_PASSWORD>

# Domain
DOMAIN=yourdomain.com
```

### 2. Generate Secrets

Generate strong passwords and secrets:

```bash
# Generate random passwords
openssl rand -base64 32

# Generate JWT secret
openssl rand -hex 64
```

---

## Docker Deployment

### 1. Build Images

Build all Docker images:

```bash
# Build backend
docker build -f Dockerfile.backend -t farmer-backend:latest .

# Build Go services
cd services/go/orchestrator-coordinator
docker build -t farmer-orchestrator:latest .
cd ../../..

cd services/go/tigerbeetle-service
docker build -t farmer-tigerbeetle:latest .
cd ../../..

# Build Python services
cd services/python/lakehouse-service
docker build -t farmer-lakehouse:latest .
cd ../../..

cd services/python/ollama-service
docker build -t farmer-ollama:latest .
cd ../../..

cd services/python/temporal-workflows
docker build -t farmer-temporal-worker:latest .
cd ../../..
```

### 2. Start Services

Start all services with Docker Compose:

```bash
# Load environment variables
export $(cat .env.production | xargs)

# Start services
docker-compose -f docker-compose.production.yml up -d

# Check status
docker-compose -f docker-compose.production.yml ps

# View logs
docker-compose -f docker-compose.production.yml logs -f
```

### 3. Initialize Database

Run database migrations:

```bash
# Access backend container
docker exec -it farmer-backend sh

# Run migrations
pnpm db:push

# Exit container
exit
```

### 4. Verify Deployment

Check that all services are healthy:

```bash
# Check service health
curl http://localhost:3000/health
curl http://localhost:8086/health
curl http://localhost:8084/health
curl http://localhost:8085/health
curl http://localhost:8087/health

# Check Prometheus
curl http://localhost:9090/-/healthy

# Check Grafana
curl http://localhost:3333/api/health

# Check Jaeger
curl http://localhost:16686/
```

---

## Monitoring Stack

### 1. Access Prometheus

- URL: `http://yourdomain.com:9090`
- No authentication by default (configure in production)

**Key Metrics to Monitor:**

- `up`: Service availability
- `http_requests_total`: Total HTTP requests
- `http_request_duration_seconds`: Request latency
- `process_cpu_seconds_total`: CPU usage
- `process_resident_memory_bytes`: Memory usage

### 2. Access Grafana

- URL: `http://yourdomain.com:3333`
- Username: `admin`
- Password: (from `GRAFANA_PASSWORD` in `.env.production`)

**Pre-configured Dashboards:**

1. **Service Health**: Overall platform health
2. **User Journey Metrics**: User interaction tracking
3. **Database Performance**: PostgreSQL metrics
4. **API Gateway**: APISIX metrics
5. **Messaging Channels**: USSD/SMS/WhatsApp metrics

### 3. Configure Alerts

Alerts are defined in `monitoring/alerts.yml`:

- Service downtime
- High error rates
- Slow response times
- Database connection issues
- Cache performance degradation

**Set up Alertmanager** (optional):

```yaml
# alertmanager.yml
route:
  receiver: 'email'
  
receivers:
  - name: 'email'
    email_configs:
      - to: 'ops@yourdomain.com'
        from: 'alerts@yourdomain.com'
        smarthost: 'smtp.gmail.com:587'
        auth_username: 'alerts@yourdomain.com'
        auth_password: '<APP_PASSWORD>'
```

---

## Distributed Tracing

### 1. Access Jaeger UI

- URL: `http://yourdomain.com:16686`
- No authentication by default

### 2. View Traces

1. Select service: `farmer-backend`
2. Select operation: e.g., `POST /api/trpc/farmers.create`
3. Click **Find Traces**
4. View trace details, spans, and timing

### 3. Trace Retention

Configure retention in `docker-compose.production.yml`:

```yaml
jaeger:
  environment:
    - SPAN_STORAGE_TYPE=badger
    - BADGER_EPHEMERAL=false
    - BADGER_DIRECTORY_VALUE=/badger/data
    - BADGER_DIRECTORY_KEY=/badger/key
```

---

## SSL/TLS Configuration

### 1. Obtain SSL Certificate

Using Let's Encrypt with Certbot:

```bash
# Install Certbot
sudo apt-get update
sudo apt-get install certbot

# Obtain certificate
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Certificates will be saved to:
# /etc/letsencrypt/live/yourdomain.com/fullchain.pem
# /etc/letsencrypt/live/yourdomain.com/privkey.pem
```

### 2. Configure Nginx

Create `nginx/nginx.conf`:

```nginx
events {
    worker_connections 1024;
}

http {
    upstream backend {
        server backend:3000;
    }

    server {
        listen 80;
        server_name yourdomain.com www.yourdomain.com;
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name yourdomain.com www.yourdomain.com;

        ssl_certificate /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        location / {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

### 3. Copy Certificates

```bash
# Create SSL directory
mkdir -p nginx/ssl

# Copy certificates
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem nginx/ssl/
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem nginx/ssl/
sudo chmod 644 nginx/ssl/fullchain.pem
sudo chmod 600 nginx/ssl/privkey.pem
```

### 4. Restart Nginx

```bash
docker-compose -f docker-compose.production.yml restart nginx
```

---

## Scaling

### 1. Horizontal Scaling

Scale backend instances:

```bash
docker-compose -f docker-compose.production.yml up -d --scale backend=3
```

### 2. Load Balancing

Update `nginx/nginx.conf`:

```nginx
upstream backend {
    least_conn;
    server backend_1:3000;
    server backend_2:3000;
    server backend_3:3000;
}
```

### 3. Database Scaling

For production, use managed PostgreSQL with read replicas:

- **AWS RDS**: PostgreSQL with Multi-AZ
- **Google Cloud SQL**: PostgreSQL with HA
- **Azure Database**: PostgreSQL with replication

### 4. Redis Scaling

Use Redis Cluster or managed Redis:

- **AWS ElastiCache**: Redis cluster
- **Google Cloud Memorystore**: Redis with HA
- **Azure Cache**: Redis with replication

---

## Backup & Recovery

### 1. Database Backup

Automated daily backups:

```bash
#!/bin/bash
# backup-db.sh

BACKUP_DIR="/backups/postgres"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/farmer_data_$DATE.sql.gz"

# Create backup
docker exec farmer-postgres pg_dump -U postgres farmer_data | gzip > $BACKUP_FILE

# Keep only last 30 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_FILE"
```

Add to crontab:

```bash
# Run daily at 2 AM
0 2 * * * /path/to/backup-db.sh
```

### 2. Database Restore

```bash
# Restore from backup
gunzip < /backups/postgres/farmer_data_20231125_020000.sql.gz | \
  docker exec -i farmer-postgres psql -U postgres -d farmer_data
```

### 3. Volume Backup

Backup Docker volumes:

```bash
# Backup Postgres data
docker run --rm -v farmer-data-collection_postgres_data:/data -v /backups:/backup \
  alpine tar czf /backup/postgres_data_$(date +%Y%m%d).tar.gz -C /data .

# Backup Redis data
docker run --rm -v farmer-data-collection_redis_data:/data -v /backups:/backup \
  alpine tar czf /backup/redis_data_$(date +%Y%m%d).tar.gz -C /data .
```

---

## Troubleshooting

### Service Won't Start

```bash
# Check logs
docker-compose -f docker-compose.production.yml logs <service_name>

# Check resource usage
docker stats

# Restart service
docker-compose -f docker-compose.production.yml restart <service_name>
```

### Database Connection Issues

```bash
# Check PostgreSQL logs
docker logs farmer-postgres

# Test connection
docker exec farmer-postgres psql -U postgres -d farmer_data -c "SELECT 1;"

# Check connection pool
docker exec farmer-backend node -e "console.log(process.env.DATABASE_URL)"
```

### High Memory Usage

```bash
# Check memory usage
docker stats --no-stream

# Limit container memory
docker-compose -f docker-compose.production.yml up -d --scale backend=2 \
  --memory="2g" --memory-swap="2g"
```

### Africa's Talking Webhook Not Working

1. **Check webhook URL is publicly accessible**:
   ```bash
   curl https://yourdomain.com/api/trpc/africasTalking.ussdWebhook
   ```

2. **Check Africa's Talking logs** in dashboard

3. **Verify API credentials**:
   ```bash
   docker exec farmer-backend env | grep AFRICAS_TALKING
   ```

4. **Test webhook locally** using ngrok:
   ```bash
   ngrok http 3000
   # Use ngrok URL in Africa's Talking dashboard for testing
   ```

### Monitoring Not Working

```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Check Grafana datasource
curl http://localhost:3333/api/datasources

# Restart monitoring stack
docker-compose -f docker-compose.production.yml restart prometheus grafana
```

---

## Production Checklist

- [ ] Environment variables configured
- [ ] Strong passwords and secrets generated
- [ ] Africa's Talking account created and configured
- [ ] USSD shortcode approved and callback URL set
- [ ] SMS sender ID configured
- [ ] WhatsApp Business API set up
- [ ] SSL certificate obtained and configured
- [ ] Database migrations run
- [ ] Backup scripts configured and tested
- [ ] Monitoring dashboards accessible
- [ ] Alerts configured and tested
- [ ] Distributed tracing working
- [ ] Load testing completed
- [ ] Security audit performed
- [ ] Documentation updated

---

## Support

For issues or questions:

- **Documentation**: See `README.md` and `ARCHITECTURE.md`
- **Monitoring**: Check Grafana dashboards
- **Logs**: Use `docker-compose logs -f`
- **Tracing**: Check Jaeger UI

---

**Last Updated**: November 2024
