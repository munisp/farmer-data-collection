# Service Level Indicators & Objectives

## Platform SLOs

| SLO | Target | Measurement | Alert Threshold |
|-----|--------|-------------|-----------------|
| Availability | 99.9% | Successful requests / Total requests | <99.5% over 5m |
| Latency (p50) | <100ms | 50th percentile response time | >150ms over 5m |
| Latency (p95) | <500ms | 95th percentile response time | >750ms over 5m |
| Latency (p99) | <1000ms | 99th percentile response time | >1500ms over 5m |
| Error Rate | <0.1% | 5xx responses / Total responses | >0.5% over 5m |
| Throughput | >1000 RPS | Requests processed per second | <500 RPS sustained |

## Per-Service SLOs

### Core API (tRPC)
| Metric | Target | Critical |
|--------|--------|----------|
| Request latency p95 | <200ms | >500ms |
| Error rate | <0.05% | >0.5% |
| Concurrent connections | <5000 | >8000 |
| Memory usage | <2GB | >3.5GB |

### Database (PostgreSQL)
| Metric | Target | Critical |
|--------|--------|----------|
| Query latency p95 | <50ms | >200ms |
| Connection pool usage | <80% | >95% |
| Replication lag | <1s | >10s |
| Disk usage | <80% | >90% |

### Kafka Message Bus
| Metric | Target | Critical |
|--------|--------|----------|
| Message latency p95 | <100ms | >500ms |
| Consumer lag | <1000 msgs | >10000 msgs |
| Partition rebalance time | <30s | >60s |
| Throughput | >10000 msg/s | <1000 msg/s |

### Redis Cache
| Metric | Target | Critical |
|--------|--------|----------|
| Command latency p95 | <5ms | >20ms |
| Hit rate | >90% | <70% |
| Memory usage | <80% | >95% |
| Connected clients | <500 | >900 |

### Mobile Money (M-Pesa/MTN)
| Metric | Target | Critical |
|--------|--------|----------|
| Transaction success rate | >98% | <95% |
| Callback delivery time | <30s | >120s |
| Reconciliation accuracy | 100% | <99.5% |
| Timeout rate | <2% | >5% |

## SLI Definitions

### Availability SLI
```promql
sum(rate(http_requests_total{status!~"5.."}[5m]))
/
sum(rate(http_requests_total[5m]))
```

### Latency SLI (p95)
```promql
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
)
```

### Error Rate SLI
```promql
sum(rate(http_requests_total{status=~"5.."}[5m]))
/
sum(rate(http_requests_total[5m]))
```

### Saturation SLI
```promql
sum(process_resident_memory_bytes)
/
sum(node_memory_MemTotal_bytes)
```

## Error Budget

| Period | Budget (99.9%) | Monthly Downtime Allowed |
|--------|---------------|-------------------------|
| Monthly | 0.1% | 43.2 minutes |
| Quarterly | 0.1% | 2.16 hours |
| Annual | 0.1% | 8.76 hours |

### Error Budget Policy
- **>50% budget remaining**: Normal development velocity
- **25-50% budget remaining**: Reduce risky deployments, increase testing
- **<25% budget remaining**: Feature freeze, reliability-only changes
- **Budget exhausted**: Incident review required, no new features until replenished

## Alerting Rules

### P1 (Page immediately)
- Availability < 99.5% for 5 minutes
- Error rate > 1% for 5 minutes
- Payment processing failure > 5%
- Database connection failure

### P2 (Page within 15 minutes)
- Latency p95 > 1000ms for 10 minutes
- Kafka consumer lag > 10000 for 10 minutes
- Disk usage > 90%
- Certificate expiry < 7 days

### P3 (Ticket, business hours)
- Latency p95 > 500ms for 30 minutes
- Cache hit rate < 80% for 1 hour
- Background job failure rate > 5%
- Log volume spike > 3x normal

### P4 (Monitor, weekly review)
- Memory trending upward over 7 days
- Slow query count increasing
- API deprecation usage still active
- Test coverage dropped below threshold

## Capacity Planning

### Current Capacity
| Resource | Current | Max Capacity | Utilization |
|----------|---------|-------------|-------------|
| API Servers | 3 | 10 | 30% |
| DB Connections | 60 | 200 | 30% |
| Kafka Partitions | 12 | 48 | 25% |
| Redis Memory | 1GB | 4GB | 25% |

### Growth Projections (12 months)
| Metric | Current | +6mo | +12mo |
|--------|---------|------|-------|
| Active Users | 5,000 | 25,000 | 100,000 |
| Requests/day | 500K | 2.5M | 10M |
| Data Volume | 50GB | 250GB | 1TB |
| Transactions/day | 10K | 50K | 200K |

### Scaling Triggers
| Metric | Scale-up Trigger | Action |
|--------|-----------------|--------|
| CPU > 70% sustained | Add API replica | HPA autoscale |
| DB connections > 80% | Add read replica | PgBouncer + replica |
| Kafka lag > 5000 | Add consumer | Consumer group rebalance |
| Response time > 500ms | Scale horizontally | Add node to cluster |
