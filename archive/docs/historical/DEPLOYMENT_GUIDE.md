# Deployment & Integration Guide

## 🚀 Quick Start

### Prerequisites
- Node.js 22+
- PostgreSQL 15+
- Redis 7+
- Go 1.21+ (for Mojaloop Gateway)
- Python 3.11+ (for ML Service)
- Docker & Docker Compose (optional)

---

## 📦 Installation

### 1. Clone & Install Dependencies

```bash
# Main application
cd /home/ubuntu/farmer-data-collection
pnpm install

# Go service
cd services/mojaloop-gateway
go mod download

# Python service
cd services/ml-service
pip install -r requirements.txt
```

### 2. Database Setup

```bash
# Create database
createdb farmer_data

# Run migrations
psql -U postgres -d farmer_data -f migrations/financial-schema.sql

# Verify tables
psql -U postgres -d farmer_data -c "\dt"
```

### 3. Environment Configuration

Create `.env` file:

```bash
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/farmer_data

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this

# Mojaloop
MOJALOOP_API_URL=https://sandbox.mojaloop.io
MOJALOOP_FSP_ID=farmerpay
MOJALOOP_GATEWAY_PORT=8080

# ML Service
ML_SERVICE_URL=http://localhost:5000
ML_SERVICE_PORT=5000

# S3 Storage
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
AWS_BUCKET=farmer-data-storage

# Kafka (optional)
KAFKA_BROKERS=localhost:9092

# Application
PORT=3000
NODE_ENV=development
```

---

## 🏃 Running Services

### Development Mode

```bash
# Terminal 1: Main Application
pnpm dev

# Terminal 2: Mojaloop Gateway
cd services/mojaloop-gateway
go run main.go

# Terminal 3: ML Service
cd services/ml-service
python api.py
```

### Production Mode

```bash
# Build main application
pnpm build
pnpm start

# Build & run Mojaloop Gateway
cd services/mojaloop-gateway
go build -o mojaloop-gateway
./mojaloop-gateway

# Run ML Service with Gunicorn
cd services/ml-service
gunicorn -w 4 -b 0.0.0.0:5000 api:app
```

---

## 🐳 Docker Deployment

### Using Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  # Main Application
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/farmer_data
      - REDIS_URL=redis://redis:6379
      - MOJALOOP_API_URL=http://mojaloop-gateway:8080
      - ML_SERVICE_URL=http://ml-service:5000
    depends_on:
      - db
      - redis
      - mojaloop-gateway
      - ml-service

  # Mojaloop Gateway (Go)
  mojaloop-gateway:
    build: ./services/mojaloop-gateway
    ports:
      - "8080:8080"
    environment:
      - MOJALOOP_API_URL=https://sandbox.mojaloop.io
      - MOJALOOP_FSP_ID=farmerpay
      - DATABASE_URL=postgresql://postgres:password@db:5432/farmer_data

  # ML Service (Python)
  ml-service:
    build: ./services/ml-service
    ports:
      - "5000:5000"
    environment:
      - DB_HOST=db
      - DB_PORT=5432
      - DB_NAME=farmer_data
      - DB_USER=postgres
      - DB_PASSWORD=password

  # PostgreSQL
  db:
    image: postgres:15-alpine
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_DB=farmer_data
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./migrations:/docker-entrypoint-initdb.d

  # Redis
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### Start Services

```bash
docker-compose up -d
```

---

## 🔧 Configuration

### Mojaloop Integration

1. **Register FSP ID** at Mojaloop Hub
2. **Get API Credentials**
3. **Configure Callback URL:**
   ```bash
   CALLBACK_URL=https://your-domain.com/api/mojaloop/callback
   ```

### ML Model Training

```bash
cd services/ml-service

# Train credit scoring model
python -c "
from credit_scoring import credit_scoring_model
import pandas as pd

# Load training data
data = pd.read_csv('training_data.csv')
result = credit_scoring_model.train_model(data)
print(f'Model trained: {result}')
"

# Train fraud detection model
python -c "
from credit_scoring import fraud_detection_model
import pandas as pd

# Load training data
data = pd.read_csv('fraud_training_data.csv')
result = fraud_detection_model.train_model(data)
print(f'Model trained: {result}')
"
```

---

## 📊 Monitoring & Logging

### Health Checks

```bash
# Main application
curl http://localhost:3000/health

# Mojaloop Gateway
curl http://localhost:8080/health

# ML Service
curl http://localhost:5000/health
```

### Logs

```bash
# Application logs
tail -f logs/app.log

# Mojaloop Gateway logs
tail -f logs/mojaloop-gateway.log

# ML Service logs
tail -f logs/ml-service.log
```

### Metrics (Prometheus)

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'farmer-app'
    static_configs:
      - targets: ['localhost:3000']
  
  - job_name: 'mojaloop-gateway'
    static_configs:
      - targets: ['localhost:8080']
  
  - job_name: 'ml-service'
    static_configs:
      - targets: ['localhost:5000']
```

---

## 🧪 Testing

### Unit Tests

```bash
# Run all tests
pnpm test

# Run specific test suite
pnpm test accounting
pnpm test microfinance
pnpm test banking
```

### Integration Tests

```bash
# Test Mojaloop integration
curl -X POST http://localhost:8080/api/v1/party-lookup \
  -H "Content-Type: application/json" \
  -d '{"partyIdType": "MSISDN", "partyId": "2348012345678"}'

# Test ML service
curl -X POST http://localhost:5000/api/v1/credit-score \
  -H "Content-Type: application/json" \
  -d '{"user_id": 1}'
```

### Load Testing

```bash
# Install k6
brew install k6  # macOS
# or
sudo apt install k6  # Ubuntu

# Run load test
k6 run load-tests/accounting.js
k6 run load-tests/banking.js
```

---

## 🔐 Security Checklist

- [ ] Change default JWT_SECRET
- [ ] Enable HTTPS/TLS
- [ ] Configure firewall rules
- [ ] Set up rate limiting
- [ ] Enable audit logging
- [ ] Configure backup strategy
- [ ] Set up monitoring alerts
- [ ] Review database permissions
- [ ] Enable encryption at rest
- [ ] Configure CORS properly

---

## 📈 Performance Optimization

### Database Optimization

```sql
-- Create indexes
CREATE INDEX CONCURRENTLY idx_journal_entries_user_date 
  ON journal_entries(user_id, entry_date);

CREATE INDEX CONCURRENTLY idx_loans_user_status 
  ON loans(user_id, status);

CREATE INDEX CONCURRENTLY idx_bank_transactions_user_date 
  ON bank_transactions(user_id, transaction_date);

-- Analyze tables
ANALYZE journal_entries;
ANALYZE loans;
ANALYZE bank_transactions;
```

### Redis Caching

```typescript
// Cache credit scores
await redis.set(`credit_score:${userId}`, JSON.stringify(score), 'EX', 3600);

// Cache account balances
await redis.set(`balance:${accountCode}:${fiscalYear}`, balance, 'EX', 1800);
```

### Connection Pooling

```typescript
// PostgreSQL connection pool
const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

---

## 🚨 Troubleshooting

### Common Issues

**1. Database Connection Error**
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check connection
psql -U postgres -d farmer_data -c "SELECT 1"
```

**2. Mojaloop Gateway Not Responding**
```bash
# Check if service is running
ps aux | grep mojaloop-gateway

# Check logs
tail -f logs/mojaloop-gateway.log

# Restart service
pkill mojaloop-gateway
./mojaloop-gateway
```

**3. ML Service Errors**
```bash
# Check Python dependencies
pip list | grep scikit-learn

# Reinstall dependencies
pip install -r requirements.txt --force-reinstall

# Check database connection
python -c "
import psycopg2
conn = psycopg2.connect('postgresql://postgres:password@localhost/farmer_data')
print('Connected successfully')
"
```

**4. TypeScript Errors**
```bash
# Clear cache and rebuild
rm -rf node_modules/.cache
rm -rf .next
pnpm install
pnpm build
```

---

## 📞 Support

For issues or questions:
- **GitHub Issues:** https://github.com/farmerpay/platform/issues
- **Email:** support@farmerpay.ng
- **Documentation:** https://docs.farmerpay.ng

---

## 📄 License

Copyright © 2025 Farmer Data Collection Platform. All rights reserved.
