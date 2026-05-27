# Monitoring & Observability Guide

## Overview

This guide covers the complete monitoring and observability stack for the Farmer Data Collection Platform, including metrics collection, visualization, alerting, and troubleshooting.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Monitoring Stack                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │              │    │              │    │              │ │
│  │  Application │───▶│  Prometheus  │───▶│   Grafana    │ │
│  │   Metrics    │    │   (Storage)  │    │ (Dashboards) │ │
│  │              │    │              │    │              │ │
│  └──────────────┘    └──────────────┘    └──────────────┘ │
│         │                    │                    │         │
│         │                    │                    │         │
│         ▼                    ▼                    ▼         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │              │    │              │    │              │ │
│  │   prom-      │    │  Alert       │    │  Notification│ │
│  │   client     │    │  Manager     │    │  Channels    │ │
│  │              │    │              │    │              │ │
│  └──────────────┘    └──────────────┘    └──────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Metrics Collection

### Application Metrics

The application exposes metrics at `/metrics` endpoint using Prometheus format.

#### HTTP Metrics

```typescript
// server/services/prometheus-metrics.ts

import client from 'prom-client';

// HTTP request counter
export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status']
});

// HTTP request duration
export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

// Usage in middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    
    httpRequestsTotal.inc({
      method: req.method,
      route: req.route?.path || req.path,
      status: res.statusCode
    });
    
    httpRequestDuration.observe({
      method: req.method,
      route: req.route?.path || req.path,
      status: res.statusCode
    }, duration);
  });
  
  next();
});
```

#### Cache Metrics

```typescript
// Cache hit/miss tracking
export const cacheHitsTotal = new client.Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_key']
});

export const cacheMissesTotal = new client.Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_key']
});

export const cacheOperationDuration = new client.Histogram({
  name: 'cache_operation_duration_seconds',
  help: 'Duration of cache operations',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1]
});
```

#### Database Metrics

```typescript
// Database query metrics
export const dbQueryDuration = new client.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1, 2]
});

export const dbConnectionsActive = new client.Gauge({
  name: 'db_connections_active',
  help: 'Number of active database connections'
});

export const dbQueryErrors = new client.Counter({
  name: 'db_query_errors_total',
  help: 'Total number of database query errors',
  labelNames: ['operation', 'error_type']
});
```

#### Business Metrics

```typescript
// User activity metrics
export const userRegistrations = new client.Counter({
  name: 'user_registrations_total',
  help: 'Total number of user registrations'
});

export const userLogins = new client.Counter({
  name: 'user_logins_total',
  help: 'Total number of user logins',
  labelNames: ['success']
});

// Data creation metrics
export const dataCreated = new client.Counter({
  name: 'data_created_total',
  help: 'Total number of data records created',
  labelNames: ['type'] // farmer, farm, crop, etc.
});

// Loan metrics
export const loanApplications = new client.Counter({
  name: 'loan_applications_total',
  help: 'Total number of loan applications',
  labelNames: ['status'] // pending, approved, rejected
});

export const loanDisbursements = new client.Counter({
  name: 'loan_disbursements_total',
  help: 'Total number of loan disbursements',
  labelNames: ['payment_method']
});
```

### System Metrics

Prometheus automatically collects system metrics:

- **CPU Usage**: `process_cpu_seconds_total`
- **Memory Usage**: `process_resident_memory_bytes`
- **Heap Usage**: `nodejs_heap_size_used_bytes`
- **Event Loop Lag**: `nodejs_eventloop_lag_seconds`
- **Active Handles**: `nodejs_active_handles_total`

## Prometheus Configuration

### Scrape Configuration

```yaml
# config/prometheus/prometheus.yml

global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: 'farmer-platform'
    environment: 'production'

# Alerting configuration
alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - alertmanager:9093

# Load alert rules
rule_files:
  - 'alerts.yml'

# Scrape configurations
scrape_configs:
  # Application metrics
  - job_name: 'farmer-app'
    static_configs:
      - targets: ['app-server:3100']
    metrics_path: '/metrics'
    scrape_interval: 10s
    
  # APISIX metrics
  - job_name: 'apisix'
    static_configs:
      - targets: ['apisix:9091']
    metrics_path: '/apisix/prometheus/metrics'
    
  # Redis metrics (via redis_exporter)
  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']
    
  # PostgreSQL metrics (via postgres_exporter)
  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']
    
  # Node exporter (system metrics)
  - job_name: 'node'
    static_configs:
      - targets: ['node-exporter:9100']
```

### Alert Rules

```yaml
# config/prometheus/alerts.yml

groups:
  - name: application_alerts
    interval: 30s
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: |
          rate(http_requests_total{status=~"5.."}[5m]) 
          / 
          rate(http_requests_total[5m]) 
          > 0.05
        for: 5m
        labels:
          severity: critical
          component: application
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value | humanizePercentage }} (threshold: 5%)"
          
      # High response time
      - alert: HighResponseTime
        expr: |
          histogram_quantile(0.95, 
            rate(http_request_duration_seconds_bucket[5m])
          ) > 2
        for: 5m
        labels:
          severity: warning
          component: application
        annotations:
          summary: "High response time detected"
          description: "95th percentile response time is {{ $value }}s (threshold: 2s)"
          
      # Application down
      - alert: ApplicationDown
        expr: up{job="farmer-app"} == 0
        for: 1m
        labels:
          severity: critical
          component: application
        annotations:
          summary: "Application is down"
          description: "The application has been down for more than 1 minute"

  - name: cache_alerts
    interval: 30s
    rules:
      # Low cache hit rate
      - alert: LowCacheHitRate
        expr: |
          cache_hits_total 
          / 
          (cache_hits_total + cache_misses_total) 
          < 0.5
        for: 10m
        labels:
          severity: warning
          component: cache
        annotations:
          summary: "Low cache hit rate"
          description: "Cache hit rate is {{ $value | humanizePercentage }} (threshold: 50%)"
          
      # Redis down
      - alert: RedisDown
        expr: up{job="redis"} == 0
        for: 1m
        labels:
          severity: critical
          component: cache
        annotations:
          summary: "Redis is down"
          description: "Redis has been down for more than 1 minute"
          
      # High Redis memory usage
      - alert: HighRedisMemory
        expr: redis_memory_used_bytes / redis_memory_max_bytes > 0.9
        for: 5m
        labels:
          severity: warning
          component: cache
        annotations:
          summary: "High Redis memory usage"
          description: "Redis memory usage is {{ $value | humanizePercentage }}"

  - name: database_alerts
    interval: 30s
    rules:
      # Slow database queries
      - alert: SlowDatabaseQueries
        expr: |
          histogram_quantile(0.95, 
            rate(db_query_duration_seconds_bucket[5m])
          ) > 1
        for: 5m
        labels:
          severity: warning
          component: database
        annotations:
          summary: "Slow database queries detected"
          description: "95th percentile query time is {{ $value }}s (threshold: 1s)"
          
      # High database connections
      - alert: HighDatabaseConnections
        expr: db_connections_active > 80
        for: 5m
        labels:
          severity: warning
          component: database
        annotations:
          summary: "High number of database connections"
          description: "Active connections: {{ $value }} (threshold: 80)"
          
      # Database down
      - alert: DatabaseDown
        expr: up{job="postgres"} == 0
        for: 1m
        labels:
          severity: critical
          component: database
        annotations:
          summary: "Database is down"
          description: "PostgreSQL has been down for more than 1 minute"

  - name: business_alerts
    interval: 1m
    rules:
      # High loan application rejection rate
      - alert: HighLoanRejectionRate
        expr: |
          rate(loan_applications_total{status="rejected"}[1h])
          /
          rate(loan_applications_total[1h])
          > 0.5
        for: 1h
        labels:
          severity: warning
          component: business
        annotations:
          summary: "High loan rejection rate"
          description: "Rejection rate is {{ $value | humanizePercentage }} in the last hour"
          
      # No user activity
      - alert: NoUserActivity
        expr: |
          rate(user_logins_total[30m]) == 0
          and
          hour() >= 8 and hour() <= 18
        for: 30m
        labels:
          severity: warning
          component: business
        annotations:
          summary: "No user activity detected"
          description: "No user logins in the last 30 minutes during business hours"
```

## Grafana Dashboards

### Dashboard 1: Application Overview

**Panels:**

1. **Request Rate**
   ```promql
   rate(http_requests_total[5m])
   ```

2. **Error Rate**
   ```promql
   rate(http_requests_total{status=~"5.."}[5m]) 
   / 
   rate(http_requests_total[5m])
   ```

3. **Response Time (p50, p95, p99)**
   ```promql
   histogram_quantile(0.50, rate(http_request_duration_seconds_bucket[5m]))
   histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
   histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
   ```

4. **Requests by Status Code**
   ```promql
   sum by (status) (rate(http_requests_total[5m]))
   ```

5. **Top Endpoints by Request Count**
   ```promql
   topk(10, sum by (route) (rate(http_requests_total[5m])))
   ```

6. **Slowest Endpoints**
   ```promql
   topk(10, 
     histogram_quantile(0.95, 
       sum by (route) (rate(http_request_duration_seconds_bucket[5m]))
     )
   )
   ```

### Dashboard 2: Cache Performance

**Panels:**

1. **Cache Hit Rate**
   ```promql
   cache_hits_total / (cache_hits_total + cache_misses_total)
   ```

2. **Cache Operations Rate**
   ```promql
   rate(cache_hits_total[5m])
   rate(cache_misses_total[5m])
   ```

3. **Cache Operation Duration**
   ```promql
   histogram_quantile(0.95, rate(cache_operation_duration_seconds_bucket[5m]))
   ```

4. **Redis Memory Usage**
   ```promql
   redis_memory_used_bytes
   ```

5. **Redis Keys Count**
   ```promql
   redis_db_keys
   ```

6. **Cache Hit Rate by Key**
   ```promql
   sum by (cache_key) (cache_hits_total) 
   / 
   (sum by (cache_key) (cache_hits_total) + sum by (cache_key) (cache_misses_total))
   ```

### Dashboard 3: Database Performance

**Panels:**

1. **Query Duration (p95)**
   ```promql
   histogram_quantile(0.95, rate(db_query_duration_seconds_bucket[5m]))
   ```

2. **Query Rate by Operation**
   ```promql
   sum by (operation) (rate(db_query_duration_seconds_count[5m]))
   ```

3. **Active Connections**
   ```promql
   db_connections_active
   ```

4. **Query Errors**
   ```promql
   rate(db_query_errors_total[5m])
   ```

5. **Slowest Tables**
   ```promql
   topk(10,
     histogram_quantile(0.95,
       sum by (table) (rate(db_query_duration_seconds_bucket[5m]))
     )
   )
   ```

### Dashboard 4: Business Metrics

**Panels:**

1. **User Registrations (24h)**
   ```promql
   increase(user_registrations_total[24h])
   ```

2. **User Logins (hourly)**
   ```promql
   rate(user_logins_total[1h]) * 3600
   ```

3. **Login Success Rate**
   ```promql
   sum(rate(user_logins_total{success="true"}[5m]))
   /
   sum(rate(user_logins_total[5m]))
   ```

4. **Data Creation Rate**
   ```promql
   sum by (type) (rate(data_created_total[5m]))
   ```

5. **Loan Applications by Status**
   ```promql
   sum by (status) (increase(loan_applications_total[24h]))
   ```

6. **Loan Disbursement Volume**
   ```promql
   sum by (payment_method) (increase(loan_disbursements_total[24h]))
   ```

## Alerting

### Alert Manager Configuration

```yaml
# config/alertmanager/alertmanager.yml

global:
  resolve_timeout: 5m
  
route:
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'default'
  
  routes:
    # Critical alerts go to PagerDuty
    - match:
        severity: critical
      receiver: 'pagerduty'
      continue: true
      
    # All alerts go to Slack
    - match_re:
        severity: ^(warning|critical)$
      receiver: 'slack'

receivers:
  - name: 'default'
    email_configs:
      - to: 'ops@example.com'
        from: 'alertmanager@example.com'
        smarthost: 'smtp.gmail.com:587'
        auth_username: 'alertmanager@example.com'
        auth_password: 'password'
        
  - name: 'slack'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK'
        channel: '#alerts'
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
        
  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: 'YOUR_PAGERDUTY_SERVICE_KEY'
```

## Logging

### Structured Logging

```typescript
// server/lib/logger.ts

import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'farmer-app',
    environment: process.env.NODE_ENV
  },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error'
    }),
    new winston.transports.File({
      filename: 'logs/combined.log'
    })
  ]
});

// Usage
logger.info('User logged in', { userId: user.id, email: user.email });
logger.error('Database query failed', { error: err.message, query: sql });
```

## Tracing (Optional)

### OpenTelemetry Integration

```typescript
// server/instrumentation.ts

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';

const sdk = new NodeSDK({
  traceExporter: new PrometheusExporter(),
  instrumentations: [getNodeAutoInstrumentations()]
});

sdk.start();
```

## Best Practices

### 1. Metric Naming

- Use descriptive names: `http_requests_total` not `requests`
- Include units: `_seconds`, `_bytes`, `_total`
- Use consistent labels: `method`, `status`, `route`

### 2. Cardinality Management

- Avoid high-cardinality labels (e.g., user IDs, timestamps)
- Use bounded label values (e.g., status codes, not error messages)
- Aggregate similar metrics

### 3. Alert Design

- Set appropriate thresholds based on SLOs
- Use `for` duration to avoid alert flapping
- Include actionable annotations
- Group related alerts

### 4. Dashboard Design

- Start with high-level overview
- Drill down into specific components
- Use consistent time ranges
- Add documentation panels

## Troubleshooting

### High Memory Usage

```promql
# Check memory by service
process_resident_memory_bytes{job="farmer-app"}

# Check heap usage
nodejs_heap_size_used_bytes / nodejs_heap_size_total_bytes
```

### Slow Requests

```promql
# Find slow endpoints
topk(10, 
  histogram_quantile(0.95, 
    sum by (route) (rate(http_request_duration_seconds_bucket[5m]))
  )
)

# Check database query time
histogram_quantile(0.95, rate(db_query_duration_seconds_bucket[5m]))
```

### Cache Issues

```promql
# Check cache hit rate
cache_hits_total / (cache_hits_total + cache_misses_total)

# Find keys with low hit rate
topk(10,
  cache_misses_total / (cache_hits_total + cache_misses_total)
)
```

## Maintenance

### Prometheus Data Retention

```yaml
# Adjust retention in docker-compose
command:
  - '--storage.tsdb.retention.time=30d'
  - '--storage.tsdb.retention.size=50GB'
```

### Backup Prometheus Data

```bash
# Create snapshot
curl -XPOST http://localhost:9090/api/v1/admin/tsdb/snapshot

# Backup snapshot
tar -czf prometheus-backup.tar.gz /prometheus/snapshots/
```

### Grafana Backup

```bash
# Export dashboards
curl -H "Authorization: Bearer $GRAFANA_API_KEY" \
  http://localhost:3333/api/dashboards/db/application-overview \
  > dashboard-backup.json
```

## Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [prom-client Library](https://github.com/siimon/prom-client)
- [PromQL Cheat Sheet](https://promlabs.com/promql-cheat-sheet/)
