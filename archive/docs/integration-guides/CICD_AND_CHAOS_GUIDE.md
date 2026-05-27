# CI/CD Pipeline & Chaos Engineering Guide

Complete guide for continuous integration, continuous deployment, and chaos engineering practices.

## Table of Contents

1. [CI/CD Pipeline Overview](#cicd-pipeline-overview)
2. [GitHub Actions Workflow](#github-actions-workflow)
3. [Blue-Green Deployment](#blue-green-deployment)
4. [Chaos Engineering](#chaos-engineering)
5. [SLA Monitoring](#sla-monitoring)
6. [Best Practices](#best-practices)

## CI/CD Pipeline Overview

The platform uses a comprehensive CI/CD pipeline with GitHub Actions for automated testing, building, and deployment.

### Pipeline Stages

```
┌─────────────┐
│ Code Push   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 1: Code Quality & Linting                        │
│  - TypeScript type checking                             │
│  - ESLint                                               │
│  - Code formatting                                      │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 2: Unit & Integration Tests                      │
│  - PostgreSQL + Redis services                          │
│  - Database migrations                                  │
│  - Unit tests                                           │
│  - Integration tests                                    │
│  - Code coverage upload                                 │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 3: Build & Validate                              │
│  - Application build                                    │
│  - Build size check (< 50MB)                           │
│  - Artifact upload                                      │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 4: Load Testing (PR only)                        │
│  - k6 authentication test                               │
│  - k6 marketplace test                                  │
│  - Performance budget validation                        │
│  - Results upload                                       │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 5: Security Scanning                             │
│  - Trivy vulnerability scanner                          │
│  - npm audit                                            │
│  - SARIF upload to GitHub Security                      │
└──────┬──────────────────────────────────────────────────┘
       │
       ├─────────────────────┬──────────────────────────┐
       │                     │                          │
       ▼                     ▼                          ▼
┌─────────────┐      ┌─────────────┐         ┌─────────────┐
│  Staging    │      │ Production  │         │   Manual    │
│  (develop)  │      │   (main)    │         │   Review    │
└─────────────┘      └─────────────┘         └─────────────┘
```

## GitHub Actions Workflow

### Workflow File

Location: `.github/workflows/ci-cd.yml`

### Triggers

- **Push** to `main` or `develop` branches
- **Pull requests** to `main` or `develop` branches

### Jobs

#### 1. Lint Job

```yaml
- TypeScript type checking
- ESLint code quality
- Prettier formatting check
```

**Duration**: ~2 minutes

#### 2. Test Job

```yaml
- PostgreSQL 16 + Redis 7
- Database migrations
- Unit tests (vitest)
- Integration tests
- Code coverage (Codecov)
```

**Duration**: ~5 minutes

#### 3. Build Job

```yaml
- pnpm build
- Build size validation (< 50MB)
- Artifact upload (7 days retention)
```

**Duration**: ~3 minutes

#### 4. Load Test Job (PR only)

```yaml
- Start application with test DB
- Install k6
- Run authentication load test (10 VUs, 30s)
- Run marketplace load test (20 VUs, 30s)
- Validate performance budgets:
  * Auth p95 < 500ms
  * Marketplace p95 < 1000ms
- Upload results (30 days retention)
```

**Duration**: ~5 minutes

**Performance Budgets**:
- Authentication endpoints: p95 < 500ms
- Marketplace endpoints: p95 < 1000ms
- ML endpoints: p95 < 3000ms

#### 5. Security Job

```yaml
- Trivy filesystem scan
- npm audit (moderate level)
- SARIF upload to GitHub Security
```

**Duration**: ~2 minutes

#### 6. Deploy Staging Job

**Trigger**: Push to `develop` branch

```yaml
- Download build artifacts
- Deploy to staging environment
- Run smoke tests
- Slack notification
```

**Duration**: ~5 minutes

#### 7. Deploy Production Job

**Trigger**: Push to `main` branch

```yaml
- Download build artifacts
- Deploy to blue environment
- Health checks on blue
- Smoke tests on blue
- Switch traffic (green → blue)
- Monitor metrics (5 minutes)
- Rollback on failure
- Create GitHub release
- Slack notification
```

**Duration**: ~10 minutes

### Required Secrets

Configure in GitHub repository settings:

```
STAGING_DEPLOY_KEY      # SSH key for staging deployment
STAGING_HOST            # Staging server hostname
PRODUCTION_DEPLOY_KEY   # SSH key for production deployment
PRODUCTION_HOST         # Production server hostname
SLACK_WEBHOOK           # Slack webhook URL for notifications
CODECOV_TOKEN           # Codecov upload token (optional)
```

## Blue-Green Deployment

### Overview

Blue-green deployment enables zero-downtime deployments with instant rollback capability.

### Architecture

```
                    ┌──────────────┐
                    │ Load Balancer│
                    └──────┬───────┘
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
      ┌───────────────┐         ┌───────────────┐
      │  Blue Env     │         │  Green Env    │
      │  (New)        │         │  (Current)    │
      │               │         │               │
      │  v2.0.0       │         │  v1.9.0       │
      └───────────────┘         └───────────────┘
```

### Deployment Process

#### Step 1: Deploy to Blue Environment

```bash
./scripts/deploy-blue-green.sh blue
```

**Actions**:
1. Stop services in blue environment
2. Pull latest code
3. Install dependencies
4. Run database migrations
5. Build application
6. Start services

#### Step 2: Health Checks

**Automated checks**:
- `/api/health` endpoint (5 retries, 10s interval)
- Critical endpoint smoke tests
- Service availability verification

**Failure**: Automatic rollback if health checks fail

#### Step 3: Traffic Switch

**Gradual rollout**:
1. Route 10% traffic to blue
2. Monitor for 1 minute
3. Route 50% traffic to blue
4. Monitor for 2 minutes
5. Route 100% traffic to blue

**Load balancer configuration**:
```nginx
upstream backend {
    server blue:3000 weight=100;
    server green:3000 weight=0;
}
```

#### Step 4: Monitoring Period

**Duration**: 5 minutes

**Monitored metrics**:
- Error rate (< 0.1%)
- Response time (p95 < 500ms)
- Request throughput
- CPU/memory usage

**Failure**: Automatic rollback to green

#### Step 5: Finalize

**Actions**:
- Stop green environment
- Update DNS (if needed)
- Create GitHub release
- Send notifications

### Manual Rollback

```bash
# Switch traffic back to green
./scripts/switch-traffic.sh green

# Or use full rollback script
./scripts/rollback-deployment.sh
```

### Rollback Triggers

- Health check failures
- High error rate (> 0.1%)
- High latency (p95 > 1000ms)
- Manual intervention

## Chaos Engineering

### Overview

Chaos engineering validates system resilience by intentionally injecting failures.

### Chaos Mesh Installation

```bash
# Install Chaos Mesh
./chaos/install-chaos-mesh.sh

# Access dashboard
kubectl port-forward -n chaos-mesh svc/chaos-dashboard 2333:2333

# Open: http://localhost:2333
```

### Experiment Types

#### 1. Pod Failures

**File**: `chaos/experiments/pod-failure.yaml`

**Experiments**:
- **Pod Failure**: Simulate pod becoming unavailable (30s)
- **Pod Kill**: Terminate pod abruptly (10s)
- **Container Kill**: Kill specific container (15s)

**Schedule**: Every 1-3 hours

**Apply**:
```bash
kubectl apply -f chaos/experiments/pod-failure.yaml
```

**Expected Behavior**:
- Kubernetes restarts failed pods
- Load balancer routes traffic to healthy pods
- No user-facing errors
- Automated remediation detects and reports

#### 2. Network Chaos

**File**: `chaos/experiments/network-chaos.yaml`

**Experiments**:
- **Network Delay**: Add 100ms latency (2m)
- **Packet Loss**: 10% packet loss (1m)
- **Network Partition**: Isolate backend from database (30s)
- **Bandwidth Limit**: Throttle to 1mbps (1m)

**Schedule**: Every 4-12 hours

**Apply**:
```bash
kubectl apply -f chaos/experiments/network-chaos.yaml
```

**Expected Behavior**:
- Application handles network delays gracefully
- Retry logic compensates for packet loss
- Connection pools reconnect after partition
- Degraded performance alerts trigger

#### 3. Resource Stress

**File**: `chaos/experiments/stress-chaos.yaml`

**Experiments**:
- **Memory Stress**: Allocate 256MB (2m)
- **CPU Stress**: 50% CPU load (3m)
- **Disk Latency**: 100ms I/O delay (2m)
- **Disk Fill**: Fill 1GB disk space (1m)

**Schedule**: Every 4-12 hours

**Apply**:
```bash
kubectl apply -f chaos/experiments/stress-chaos.yaml
```

**Expected Behavior**:
- Application continues serving requests
- Resource limits prevent OOM kills
- Auto-scaling triggers if needed
- Performance degradation alerts

### Chaos Experiment Workflow

```
1. Define Experiment
   ↓
2. Apply to Cluster
   ↓
3. Monitor Metrics
   ↓
4. Validate Remediation
   ↓
5. Document Findings
   ↓
6. Improve Resilience
```

### Validation Checklist

After each chaos experiment:

- [ ] Application remained available
- [ ] Error rate stayed below SLO (< 0.1%)
- [ ] Automated remediation triggered
- [ ] Alerts fired correctly
- [ ] Recovery time within MTTR target
- [ ] No data loss or corruption
- [ ] Logs captured failure details

### Chaos Engineering Best Practices

1. **Start small**: Begin with low-impact experiments
2. **Business hours**: Run experiments during working hours initially
3. **Gradual rollout**: Increase blast radius over time
4. **Monitor closely**: Watch dashboards during experiments
5. **Document everything**: Record observations and improvements
6. **Automate validation**: Use scripts to verify expected behavior
7. **Regular schedule**: Run experiments continuously, not just once

## SLA Monitoring

### SLA Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Uptime** | 99.9% | Monthly |
| **API Latency (p95)** | < 500ms | Per request |
| **Error Rate** | < 0.1% | Per request |
| **MTTR** | < 15 minutes | Per incident |

### SLA Dashboard

**Location**: Grafana → SLA Monitoring Dashboard

**URL**: http://localhost:3333/d/sla-monitoring

**Panels**:
1. **99.9% Uptime SLA Compliance**: Current uptime percentage
2. **MTTR**: Mean time to recovery
3. **Error Budget Remaining**: Percentage of error budget left
4. **API Latency SLI**: p95 latency with SLO threshold
5. **Availability SLI**: Availability percentage over time
6. **Request Throughput SLI**: Requests per second
7. **Error Rate SLI**: Error percentage with SLO threshold
8. **Incidents by Severity**: Pie chart of P0-P3 incidents
9. **SLA Breach Events**: Table of recent breaches
10. **DORA Metrics**: Deployment frequency, change failure rate, lead time, restore time

### Error Budget

**Calculation**:
```
SLA Target: 99.9%
Allowed Downtime per Month: 43.2 minutes
Allowed Error Rate: 0.1%

Error Budget = (1 - SLA Target) = 0.001
Budget Remaining = (Allowed Errors - Actual Errors) / Allowed Errors
Burn Rate = Budget Used / Days Elapsed * 30
```

**Example**:
```
Total Requests: 10,000,000
Failed Requests: 5,000
Allowed Failures: 10,000 (0.1%)

Budget Used = 5,000 / 10,000 = 50%
Budget Remaining = 50%
```

### SLA Breach Notifications

**Alerting Rules**:

1. **Critical**: Availability < 99.9%
   - Notify: PagerDuty, Slack, Email
   - Escalate: Immediate

2. **Warning**: Error budget < 25%
   - Notify: Slack, Email
   - Escalate: Next business day

3. **Info**: Error budget < 50%
   - Notify: Slack
   - Escalate: Weekly review

**Notification Channels**:
- **Slack**: #sla-alerts channel
- **Email**: oncall@farmerplatform.com
- **PagerDuty**: Critical incidents only

### DORA Metrics

**Four Key Metrics**:

1. **Deployment Frequency**
   - Target: ≥ 10 deployments/week
   - Current: Tracked automatically by CI/CD

2. **Lead Time for Changes**
   - Target: < 24 hours
   - Measured: Commit to production

3. **Change Failure Rate**
   - Target: < 15%
   - Measured: Failed deployments / total deployments

4. **Time to Restore Service**
   - Target: < 1 hour
   - Measured: Incident detection to resolution

## Best Practices

### CI/CD Best Practices

1. **Fast feedback**: Keep pipeline under 15 minutes
2. **Fail fast**: Run quick checks first (lint, typecheck)
3. **Parallel jobs**: Run independent jobs concurrently
4. **Cache dependencies**: Use pnpm cache for faster installs
5. **Artifact reuse**: Build once, deploy many times
6. **Automated rollback**: Never require manual intervention
7. **Gradual rollout**: Use blue-green or canary deployments
8. **Monitor deployments**: Watch metrics for 5+ minutes
9. **Version tagging**: Tag every production deployment
10. **Notifications**: Alert team on deployment status

### Chaos Engineering Best Practices

1. **Hypothesis-driven**: Define expected behavior before experiment
2. **Minimal blast radius**: Start with single pod/service
3. **Production-like**: Run in staging first, then production
4. **Scheduled experiments**: Regular, predictable chaos
5. **Automated validation**: Scripts to verify resilience
6. **Incident simulation**: Practice incident response
7. **Team awareness**: Notify team before experiments
8. **Documentation**: Record findings and improvements
9. **Continuous improvement**: Fix weaknesses discovered
10. **Game days**: Quarterly chaos engineering exercises

### SLA Monitoring Best Practices

1. **Customer-centric**: Track metrics users care about
2. **Realistic targets**: Set achievable SLOs
3. **Error budgets**: Balance reliability and velocity
4. **Proactive alerts**: Warn before SLA breach
5. **Regular reviews**: Weekly SLA review meetings
6. **Trend analysis**: Track metrics over time
7. **Incident correlation**: Link incidents to SLA impact
8. **Transparent reporting**: Share SLA status with stakeholders
9. **Continuous improvement**: Adjust SLOs based on data
10. **Automation**: Automate SLA reporting and alerting

## Troubleshooting

### CI/CD Pipeline Failures

**Problem**: Tests failing in CI but passing locally

**Solution**:
```bash
# Run tests with same environment as CI
docker-compose -f docker-compose.test.yml up -d
pnpm run test
```

**Problem**: Build size exceeds 50MB

**Solution**:
```bash
# Analyze bundle size
pnpm run build --analyze

# Remove unused dependencies
pnpm prune

# Enable code splitting
```

**Problem**: Load tests failing performance budgets

**Solution**:
1. Profile slow endpoints with Jaeger
2. Add caching for hot paths
3. Optimize database queries
4. Scale horizontally

### Deployment Failures

**Problem**: Health checks failing after deployment

**Solution**:
```bash
# Check logs
kubectl logs -l app=farmer-platform --tail=100

# Check events
kubectl get events --sort-by='.lastTimestamp'

# Manual health check
curl https://blue.farmerplatform.com/api/health
```

**Problem**: Rollback not working

**Solution**:
```bash
# Force traffic switch
./scripts/switch-traffic.sh green --force

# Or manually update load balancer
```

### Chaos Experiment Issues

**Problem**: Experiment not applying

**Solution**:
```bash
# Check Chaos Mesh status
kubectl get pods -n chaos-mesh

# Check experiment status
kubectl get podchaos -n default

# View experiment logs
kubectl describe podchaos pod-failure-experiment
```

**Problem**: Experiment causing outage

**Solution**:
```bash
# Pause all experiments
kubectl annotate podchaos --all experiment.chaos-mesh.org/pause=true

# Or delete specific experiment
kubectl delete podchaos pod-failure-experiment
```

## Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Chaos Mesh Documentation](https://chaos-mesh.org/docs/)
- [Grafana Alerting](https://grafana.com/docs/grafana/latest/alerting/)
- [SRE Book - Error Budgets](https://sre.google/sre-book/embracing-risk/)
- [DORA Metrics](https://www.devops-research.com/research.html)
