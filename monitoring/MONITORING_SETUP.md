# Monitoring Setup Guide

## Overview

The Farmer Data Collection Platform includes comprehensive monitoring and alerting capabilities using Prometheus and Grafana.

## Components

### 1. Prometheus Metrics

The application exposes metrics at `/metrics` endpoint for Prometheus scraping.

**Available Metrics:**

- **HTTP Metrics**
  - `http_request_duration_seconds`: Request latency histogram
  - `http_requests_total`: Total request count by method, route, and status
  - `http_request_errors_total`: Error count by type

- **Database Metrics**
  - `db_query_duration_seconds`: Query latency histogram
  - `db_queries_total`: Total query count by operation and table
  - `db_query_errors_total`: Query error count
  - `db_connection_pool_size`: Connection pool size
  - `db_connection_pool_used`: Used connections

- **Business Metrics**
  - `total_users`: Total registered users
  - `active_users`: Active users (last 24 hours)
  - `total_loans`: Loan count by status
  - `total_loan_amount`: Total loan amount by status
  - `total_transactions`: Transaction count by type
  - `total_revenue`: Total revenue

- **SMS Metrics**
  - `sms_messages_sent_total`: SMS count by type and status
  - `sms_message_cost_total`: SMS cost by type

- **Sync Metrics**
  - `sync_operations_total`: Sync operation count
  - `sync_duration_seconds`: Sync operation duration
  - `sync_conflicts_total`: Sync conflict count

- **Authentication Metrics**
  - `auth_attempts_total`: Auth attempt count
  - `auth_failures_total`: Auth failure count

- **System Metrics**
  - `nodejs_eventloop_lag_seconds`: Event loop lag
  - `process_resident_memory_bytes`: Memory usage
  - `nodejs_heap_size_used_bytes`: Heap usage

### 2. Grafana Dashboard

A pre-configured Grafana dashboard is available in `monitoring/grafana-dashboard.json`.

**Dashboard Panels:**
- HTTP request rate and duration
- HTTP error rate
- Database query performance
- Connection pool usage
- Active users and total users
- Loan statistics
- Sync operations and conflicts
- Authentication metrics
- SMS metrics
- Event loop lag
- Memory usage
- Health check status

### 3. Alert Rules

Alert rules are defined in `monitoring/alert-rules.yml` for Prometheus Alertmanager.

**Alert Categories:**
- HTTP errors (warning at 0.1/sec, critical at 1/sec)
- Slow responses (warning at 5s p95)
- Database errors and slow queries
- Connection pool exhaustion (warning at 90%)
- Component health failures
- High event loop lag (warning at 0.1s, critical at 1s)
- High memory usage (warning at 1GB, critical at 2GB)
- Sync conflicts and failures
- Authentication failures (possible brute force attacks)
- SMS failures and high costs
- Service downtime

## Setup Instructions

### 1. Prometheus Setup

**Install Prometheus:**
```bash
# Download Prometheus
wget https://github.com/prometheus/prometheus/releases/download/v2.45.0/prometheus-2.45.0.linux-amd64.tar.gz
tar xvfz prometheus-2.45.0.linux-amd64.tar.gz
cd prometheus-2.45.0.linux-amd64
```

**Configure Prometheus (`prometheus.yml`):**
```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

# Load alert rules
rule_files:
  - "alert-rules.yml"

# Alertmanager configuration
alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - localhost:9093

scrape_configs:
  - job_name: 'farmer-platform'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/metrics'
```

**Start Prometheus:**
```bash
./prometheus --config.file=prometheus.yml
```

Access Prometheus at `http://localhost:9090`

### 2. Grafana Setup

**Install Grafana:**
```bash
# Ubuntu/Debian
sudo apt-get install -y software-properties-common
sudo add-apt-repository "deb https://packages.grafana.com/oss/deb stable main"
wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -
sudo apt-get update
sudo apt-get install grafana

# Start Grafana
sudo systemctl start grafana-server
sudo systemctl enable grafana-server
```

**Configure Grafana:**

1. Access Grafana at `http://localhost:3000` (default credentials: admin/admin)
2. Add Prometheus data source:
   - Go to Configuration → Data Sources
   - Add Prometheus
   - URL: `http://localhost:9090`
   - Save & Test

3. Import dashboard:
   - Go to Dashboards → Import
   - Upload `monitoring/grafana-dashboard.json`
   - Select Prometheus data source
   - Import

### 3. Alertmanager Setup

**Install Alertmanager:**
```bash
wget https://github.com/prometheus/alertmanager/releases/download/v0.26.0/alertmanager-0.26.0.linux-amd64.tar.gz
tar xvfz alertmanager-0.26.0.linux-amd64.tar.gz
cd alertmanager-0.26.0.linux-amd64
```

**Configure Alertmanager (`alertmanager.yml`):**
```yaml
global:
  resolve_timeout: 5m
  smtp_smarthost: 'smtp.gmail.com:587'
  smtp_from: 'alerts@yourcompany.com'
  smtp_auth_username: 'your-email@gmail.com'
  smtp_auth_password: 'your-app-password'

route:
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'email-notifications'
  routes:
    - match:
        severity: critical
      receiver: 'critical-alerts'
      repeat_interval: 1h

receivers:
  - name: 'email-notifications'
    email_configs:
      - to: 'team@yourcompany.com'
        headers:
          Subject: '[{{ .Status }}] {{ .GroupLabels.alertname }}'

  - name: 'critical-alerts'
    email_configs:
      - to: 'oncall@yourcompany.com,team@yourcompany.com'
        headers:
          Subject: '[CRITICAL] {{ .GroupLabels.alertname }}'
    # Optional: Add SMS/Slack notifications
    # slack_configs:
    #   - api_url: 'YOUR_SLACK_WEBHOOK_URL'
    #     channel: '#alerts'
```

**Start Alertmanager:**
```bash
./alertmanager --config.file=alertmanager.yml
```

Access Alertmanager at `http://localhost:9093`

### 4. Docker Compose Setup (Recommended)

For easier deployment, use Docker Compose:

**Create `docker-compose.monitoring.yml`:**
```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:v2.45.0
    container_name: prometheus
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - ./monitoring/alert-rules.yml:/etc/prometheus/alert-rules.yml
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
    ports:
      - "9090:9090"
    networks:
      - monitoring

  grafana:
    image: grafana/grafana:10.0.0
    container_name: grafana
    volumes:
      - grafana-data:/var/lib/grafana
      - ./monitoring/grafana-dashboard.json:/etc/grafana/provisioning/dashboards/farmer-platform.json
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
    ports:
      - "3000:3000"
    networks:
      - monitoring

  alertmanager:
    image: prom/alertmanager:v0.26.0
    container_name: alertmanager
    volumes:
      - ./monitoring/alertmanager.yml:/etc/alertmanager/alertmanager.yml
      - alertmanager-data:/alertmanager
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
      - '--storage.path=/alertmanager'
    ports:
      - "9093:9093"
    networks:
      - monitoring

volumes:
  prometheus-data:
  grafana-data:
  alertmanager-data:

networks:
  monitoring:
    driver: bridge
```

**Start monitoring stack:**
```bash
docker-compose -f docker-compose.monitoring.yml up -d
```

## Uptime Monitoring

For external uptime monitoring, consider using:

1. **UptimeRobot** (https://uptimerobot.com)
   - Free tier: 50 monitors, 5-minute intervals
   - Monitor `/health` endpoint
   - Email/SMS alerts

2. **Pingdom** (https://www.pingdom.com)
   - Comprehensive uptime monitoring
   - Performance insights
   - Multi-location checks

3. **Better Uptime** (https://betteruptime.com)
   - Modern uptime monitoring
   - Status pages
   - Incident management

**Configuration Example (UptimeRobot):**
- Monitor Type: HTTP(s)
- URL: `https://your-domain.com/health`
- Monitoring Interval: 5 minutes
- Alert Contacts: Email, SMS, Slack
- Expected Response: 200 OK
- Keyword Match: `"status":"ok"`

## Monitoring Best Practices

1. **Set appropriate alert thresholds**
   - Avoid alert fatigue with too many false positives
   - Balance between early warning and noise

2. **Create runbooks for alerts**
   - Document how to respond to each alert
   - Include troubleshooting steps

3. **Review metrics regularly**
   - Weekly review of dashboard trends
   - Monthly capacity planning

4. **Test alerts**
   - Simulate failures to verify alerts work
   - Test notification channels

5. **Monitor costs**
   - Track SMS costs
   - Monitor database query costs
   - Set budget alerts

6. **Security monitoring**
   - Track authentication failures
   - Monitor for unusual patterns
   - Set up rate limiting alerts

## Troubleshooting

### Metrics not appearing

1. Check if application is running: `curl http://localhost:3001/health`
2. Check metrics endpoint: `curl http://localhost:3001/metrics`
3. Verify Prometheus is scraping: Check Prometheus targets at `http://localhost:9090/targets`

### Alerts not firing

1. Check alert rules syntax: `promtool check rules alert-rules.yml`
2. Verify Alertmanager is running: `curl http://localhost:9093/-/healthy`
3. Check Prometheus alert status: `http://localhost:9090/alerts`

### Grafana dashboard not loading

1. Verify Prometheus data source is configured
2. Check Prometheus is accessible from Grafana
3. Review Grafana logs: `docker logs grafana` or `sudo journalctl -u grafana-server`

## Next Steps

1. **Customize alert thresholds** based on your traffic patterns
2. **Add custom business metrics** for your specific use cases
3. **Set up log aggregation** (ELK stack or Loki)
4. **Configure distributed tracing** (Jaeger or Zipkin)
5. **Implement SLOs/SLIs** for service level objectives
