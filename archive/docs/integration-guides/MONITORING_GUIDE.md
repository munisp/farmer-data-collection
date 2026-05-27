# Monitoring & Observability Guide

Complete guide for monitoring the Farmer Data Collection Platform with distributed tracing, metrics, and dashboards.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Quick Start](#quick-start)
4. [Distributed Tracing](#distributed-tracing)
5. [Metrics Collection](#metrics-collection)
6. [Dashboards](#dashboards)
7. [Alerting](#alerting)
8. [Troubleshooting](#troubleshooting)

## Overview

The platform uses a comprehensive observability stack:

- **Jaeger**: Distributed tracing across all services
- **Prometheus**: Metrics collection and time-series database
- **Grafana**: Visualization and dashboards
- **OpenTelemetry**: Instrumentation for Node.js, Go, and Python services

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Node.js  │  │   Go     │  │  Python  │  │  Docker  │   │
│  │ Backend  │  │ Services │  │ Services │  │ Services │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │             │               │             │          │
│       └─────────────┴───────────────┴─────────────┘          │
│                           │                                   │
└───────────────────────────┼───────────────────────────────────┘
                            │
                    ┌───────┴────────┐
                    │                │
            ┌───────▼─────┐  ┌──────▼──────┐
            │   Jaeger    │  │ Prometheus  │
            │  (Traces)   │  │  (Metrics)  │
            └───────┬─────┘  └──────┬──────┘
                    │                │
                    └────────┬───────┘
                             │
                      ┌──────▼──────┐
                      │   Grafana   │
                      │(Dashboards) │
                      └─────────────┘
```

## Quick Start

### 1. Start Monitoring Stack

```bash
# Start Jaeger, Prometheus, and Grafana
docker-compose -f docker-compose.monitoring.yml up -d

# Verify services are running
docker-compose -f docker-compose.monitoring.yml ps
```

### 2. Start Application Services

```bash
# Start all middleware and application services
./scripts/start-all-services.sh --dev

# Or for production
./scripts/start-all-services.sh --prod
```

### 3. Access Dashboards

- **Grafana**: http://localhost:3333 (admin/admin)
- **Jaeger UI**: http://localhost:16686
- **Prometheus**: http://localhost:9090

## Distributed Tracing

### How It Works

1. **Request arrives** at Node.js backend
2. **Trace context created** with unique trace ID
3. **Span created** for each operation (database query, API call, etc.)
4. **Context propagated** to Go and Python services via HTTP headers
5. **Child spans created** in downstream services
6. **All spans sent** to Jaeger for visualization

### Viewing Traces

1. Open Jaeger UI: http://localhost:16686
2. Select service: `farmer-platform-backend`
3. Click "Find Traces"
4. Click on a trace to see detailed timeline

### Trace Structure Example

```
farmer-platform-backend (100ms)
├── HTTP POST /api/trpc/crops.create (95ms)
│   ├── database.query (10ms)
│   ├── go-image-service.compress (60ms)
│   │   └── image.resize (50ms)
│   ├── python-ml-service.predict (20ms)
│   │   └── model.inference (15ms)
│   └── kafka.publish (5ms)
```

### Manual Instrumentation (Node.js)

```typescript
import { createSpan, addSpanAttributes } from './server/_core/telemetry';

async function processData(data: any) {
  const span = createSpan('processData', {
    'data.size': data.length,
    'operation': 'batch-process'
  });
  
  try {
    const result = await heavyOperation(data);
    addSpanAttributes(span, { 'result.count': result.length });
    return result;
  } catch (error) {
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
}
```

### Manual Instrumentation (Go)

```go
import "farmer-platform/services/go/shared"

func ProcessImage(ctx context.Context, imageData []byte) error {
    ctx, span := shared.StartSpan(ctx, "image-service", "ProcessImage")
    defer span.End()
    
    shared.AddSpanAttributes(span, map[string]interface{}{
        "image.size": len(imageData),
        "operation": "compress",
    })
    
    // Process image...
    
    return nil
}
```

### Manual Instrumentation (Python)

```python
from services.python.shared.telemetry import start_span, add_span_attributes

def predict_yield(crop_data):
    with start_span("ml-service", "predict_yield", {
        "crop.type": crop_data["type"],
        "model.version": "1.0"
    }) as span:
        result = model.predict(crop_data)
        add_span_attributes(span, {"prediction.confidence": result.confidence})
        return result
```

## Metrics Collection

### Available Metrics

#### Node.js Backend
- `http_request_duration_seconds`: HTTP request latency
- `http_requests_total`: Total HTTP requests
- `nodejs_eventloop_lag_seconds`: Event loop lag
- `nodejs_heap_size_used_bytes`: Memory usage

#### Go Services
- `go_goroutines`: Number of goroutines
- `go_memstats_alloc_bytes`: Memory allocated
- `http_request_duration_seconds`: Request latency
- `service_operations_total`: Service-specific operations

#### Python Services
- `process_cpu_seconds_total`: CPU usage
- `process_resident_memory_bytes`: Memory usage
- `ml_predictions_total`: ML prediction count
- `ml_prediction_duration_seconds`: Prediction latency

#### Middleware
- **Redis**: `redis_keyspace_hits_total`, `redis_memory_used_bytes`
- **Kafka**: `kafka_server_brokertopicmetrics_messagesin_total`, `kafka_consumergroup_lag`
- **APISIX**: `apisix_http_requests_total`, `apisix_http_request_duration_seconds`
- **Dapr**: `dapr_component_state_operations_total`, `dapr_component_pubsub_messages_total`
- **Fluvio**: `fluvio_stream_bytes_total`, `fluvio_stream_records_total`
- **Temporal**: `temporal_workflow_completed_total`, `temporal_activity_execution_latency`

### Querying Metrics (PromQL)

```promql
# Average request rate over last 5 minutes
rate(http_requests_total[5m])

# 95th percentile response time
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Redis cache hit rate
rate(redis_keyspace_hits_total[5m]) / 
  (rate(redis_keyspace_hits_total[5m]) + rate(redis_keyspace_misses_total[5m]))

# Kafka consumer lag by topic
sum(kafka_consumergroup_lag) by (topic)

# Total active goroutines across all Go services
sum(go_goroutines{job=~"farmer-go-.*"})
```

## Dashboards

### Middleware Overview Dashboard

Location: `config/grafana/dashboards/middleware-overview.json`

**Panels:**
1. Service Health Status (all 8 middleware services)
2. Redis Cache Hit Rate & Memory Usage
3. Kafka Message Rate & Consumer Lag
4. APISIX Request Rate & Response Time
5. Dapr State Operations & Pub/Sub Messages
6. Fluvio Stream Throughput
7. Temporal Workflow Execution Rate
8. Node.js Event Loop Lag
9. Go Services Goroutines
10. Python Services CPU Usage
11. Database Query Duration

### Custom Dashboard Creation

1. Open Grafana: http://localhost:3333
2. Click "+" → "Dashboard"
3. Click "Add new panel"
4. Select "Prometheus" as data source
5. Enter PromQL query
6. Configure visualization
7. Save dashboard

## Alerting

### Pre-configured Alerts

#### High Kafka Consumer Lag
- **Condition**: Lag > 1000 messages for 5 minutes
- **Action**: Send notification
- **Severity**: Warning

#### High Event Loop Lag
- **Condition**: Lag > 100ms for 5 minutes
- **Action**: Send notification
- **Severity**: Critical

### Creating Custom Alerts

1. Open Grafana dashboard
2. Edit panel with alert condition
3. Click "Alert" tab
4. Configure:
   - Condition (threshold, time range)
   - Evaluation interval
   - Notification channel
5. Save

### Notification Channels

Supported channels:
- Email
- Slack
- PagerDuty
- Webhook
- Discord

Configuration: Grafana → Alerting → Notification channels

## Troubleshooting

### Traces Not Appearing in Jaeger

**Symptoms**: No traces visible in Jaeger UI

**Solutions**:
1. Check Jaeger is running: `docker ps | grep jaeger`
2. Verify application can reach Jaeger: `curl http://localhost:14268/api/traces`
3. Check application logs for telemetry errors
4. Ensure `ENABLE_TRACING` is not set to `false`
5. Restart services: `./scripts/stop-all-services.sh && ./scripts/start-all-services.sh`

### Metrics Not Collected

**Symptoms**: Prometheus shows no data for services

**Solutions**:
1. Check Prometheus targets: http://localhost:9090/targets
2. Verify services expose `/metrics` endpoint
3. Check Prometheus configuration: `config/prometheus/prometheus.yml`
4. Ensure services are running: `./scripts/start-all-services.sh`
5. Check firewall rules allow Prometheus to scrape services

### High Memory Usage

**Symptoms**: Services consuming excessive memory

**Solutions**:
1. Check Grafana dashboard for memory metrics
2. Identify service with high usage
3. Review traces for memory-intensive operations
4. Check for memory leaks in application code
5. Increase service memory limits if needed

### Dashboard Not Loading

**Symptoms**: Grafana dashboard shows "No data"

**Solutions**:
1. Verify Prometheus is running and has data
2. Check data source configuration in Grafana
3. Verify PromQL queries are correct
4. Check time range (default: last 6 hours)
5. Refresh dashboard or browser

### Service Health Check Failing

**Symptoms**: Service shows as "DOWN" in dashboard

**Solutions**:
1. Check service logs: `tail -f logs/<service-name>.log`
2. Verify service is running: `ps aux | grep <service-name>`
3. Test health endpoint manually: `curl http://localhost:<port>/health`
4. Check for port conflicts: `lsof -i :<port>`
5. Restart service: `./scripts/stop-all-services.sh && ./scripts/start-all-services.sh`

## Performance Tuning

### Trace Sampling

For high-traffic production environments, adjust sampling rate:

**Node.js** (`server/_core/telemetry.ts`):
```typescript
sdktrace.WithSampler(sdktrace.TraceIDRatioBased(0.1)) // 10% sampling
```

**Go** (`services/go/shared/telemetry.go`):
```go
sdktrace.WithSampler(sdktrace.TraceIDRatioBased(0.1))
```

**Python** (`services/python/shared/telemetry.py`):
```python
from opentelemetry.sdk.trace.sampling import TraceIdRatioBased
provider = TracerProvider(sampler=TraceIdRatioBased(0.1))
```

### Metrics Retention

Adjust Prometheus retention period:

```yaml
# docker-compose.monitoring.yml
command:
  - '--storage.tsdb.retention.time=90d'  # Keep metrics for 90 days
```

### Resource Limits

Set resource limits for monitoring services:

```yaml
# docker-compose.monitoring.yml
services:
  prometheus:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
```

## Best Practices

1. **Always trace critical paths**: Database queries, external API calls, ML predictions
2. **Add meaningful attributes**: User ID, request ID, operation type
3. **Use consistent naming**: Follow semantic conventions for span names
4. **Monitor key metrics**: Response time, error rate, throughput
5. **Set up alerts**: Proactive monitoring prevents outages
6. **Review traces regularly**: Identify performance bottlenecks
7. **Keep dashboards organized**: One dashboard per service or feature
8. **Document custom metrics**: Explain what each metric measures
9. **Test monitoring in staging**: Verify alerts and dashboards before production
10. **Regular maintenance**: Clean up old traces and metrics

## Additional Resources

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Jaeger Documentation](https://www.jaegertracing.io/docs/)
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [PromQL Cheat Sheet](https://promlabs.com/promql-cheat-sheet/)
