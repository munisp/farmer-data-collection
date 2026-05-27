# Security & Observability Stack Deployment Guide

Complete guide for deploying the enterprise security and observability stack including OpenAppSec, OpenCTI, Wazuh, OpenSearch, and Kubecost.

## Overview

The security stack provides comprehensive protection and monitoring:

- **OpenAppSec**: Web Application Firewall (WAF) for API protection
- **OpenCTI**: Cyber Threat Intelligence platform for security monitoring
- **Wazuh**: Security monitoring and intrusion detection system
- **OpenSearch**: Search and analytics engine for logs
- **Kubecost**: Infrastructure cost monitoring and optimization
- **Logstash**: Log processing pipeline

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Security Stack                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ OpenAppSec   │───▶│  Application │───▶│   OpenCTI    │  │
│  │     WAF      │    │    Server    │    │  Threat Intel│  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                    │                    │          │
│         │                    │                    │          │
│         ▼                    ▼                    ▼          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │    Wazuh     │───▶│  Logstash    │───▶│ OpenSearch   │  │
│  │   Security   │    │   Pipeline   │    │   Analytics  │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                                         │          │
│         │                                         │          │
│         ▼                                         ▼          │
│  ┌──────────────┐                        ┌──────────────┐  │
│  │   Kubecost   │                        │  Dashboards  │  │
│  │ Cost Monitor │                        │   & Alerts   │  │
│  └──────────────┘                        └──────────────┘  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- 16GB+ RAM (recommended)
- 100GB+ disk space
- Open ports: 5000, 5044, 5601, 5602, 8080, 8081, 9000, 9001, 9003, 9200, 9201

## Quick Start

### 1. Environment Configuration

Create `.env.security` file:

```bash
# OpenAppSec
OPENAPPSEC_TOKEN=your-token-here

# OpenCTI
OPENCTI_ADMIN_PASSWORD=ChangeMe123!
OPENCTI_ADMIN_TOKEN=your-secure-token
OPENCTI_MINIO_PASSWORD=ChangeMe123!
OPENCTI_RABBITMQ_PASSWORD=ChangeMe123!

# Wazuh
WAZUH_INDEXER_PASSWORD=SecurePassword123!
WAZUH_API_PASSWORD=MyS3cr37P450r.*-

# OpenSearch
OPENSEARCH_PASSWORD=Admin@123!

# Environment
ENVIRONMENT=production
```

### 2. Deploy Security Stack

```bash
# Deploy all security services
docker-compose -f docker-compose.security.yml --env-file .env.security up -d

# Check service status
docker-compose -f docker-compose.security.yml ps

# View logs
docker-compose -f docker-compose.security.yml logs -f
```

### 3. Verify Deployment

Check all services are running:

```bash
# OpenAppSec
curl http://localhost:8080/health

# OpenCTI
curl http://localhost:8081/health

# Wazuh
curl -k https://localhost:55000/

# OpenSearch
curl -k -u admin:Admin@123! https://localhost:9201/

# Kubecost
curl http://localhost:9003/
```

## Service Configuration

### OpenAppSec WAF

**Access**: http://localhost:8080

**Configuration**:
1. Log in with your agent token
2. Configure protection policies
3. Set up rate limiting rules
4. Enable threat detection

**Features**:
- API protection
- DDoS prevention
- Bot detection
- Rate limiting
- Threat intelligence integration

### OpenCTI Threat Intelligence

**Access**: http://localhost:8081
**Default Credentials**: admin@opencti.io / (from .env)

**Setup**:
1. Log in to OpenCTI dashboard
2. Configure threat intelligence feeds
3. Set up indicators of compromise (IOC)
4. Create threat dashboards
5. Configure alerts

**Features**:
- Threat intelligence aggregation
- IOC tracking
- Attack pattern analysis
- Threat actor profiling
- Integration with MISP, STIX/TAXII

### Wazuh Security Monitoring

**Access**: http://localhost:5601
**Default Credentials**: admin / (from .env)

**Setup**:
1. Access Wazuh dashboard
2. Deploy agents to monitored systems
3. Configure security rules
4. Set up file integrity monitoring
5. Enable vulnerability detection

**Features**:
- Intrusion detection
- File integrity monitoring
- Log analysis
- Vulnerability detection
- Compliance monitoring (PCI DSS, GDPR, HIPAA)
- Security event correlation

**Agent Deployment**:
```bash
# Install Wazuh agent on application server
curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | apt-key add -
echo "deb https://packages.wazuh.com/4.x/apt/ stable main" | tee /etc/apt/sources.list.d/wazuh.list
apt-get update
apt-get install wazuh-agent

# Configure agent
echo "WAZUH_MANAGER='localhost'" >> /var/ossec/etc/ossec.conf
systemctl restart wazuh-agent
```

### OpenSearch Analytics

**Access**: http://localhost:5602
**Default Credentials**: admin / (from .env)

**Setup**:
1. Access OpenSearch Dashboards
2. Create index patterns
3. Build log analysis dashboards
4. Set up alerts and notifications
5. Configure saved searches

**Index Patterns**:
- `farmer-logs-*` - Application logs
- `wazuh-alerts-*` - Security alerts
- `opencti-*` - Threat intelligence data

**Features**:
- Full-text search
- Log aggregation
- Real-time analytics
- Custom dashboards
- Alerting

### Kubecost Monitoring

**Access**: http://localhost:9003

**Setup**:
1. Access Kubecost dashboard
2. Configure cost allocation
3. Set up resource monitoring
4. Create cost alerts
5. Generate cost reports

**Features**:
- Infrastructure cost tracking
- Resource utilization monitoring
- Cost allocation by service
- Budget alerts
- Optimization recommendations

## Integration with Application

### 1. Configure Application Logging

Update `server/index.ts` to send logs to Logstash:

```typescript
import winston from 'winston';
import LogstashTransport from 'winston-logstash';

const logger = winston.createLogger({
  transports: [
    new LogstashTransport({
      host: 'localhost',
      port: 5000,
    }),
  ],
});
```

### 2. Configure WAF Protection

Update APISIX to route through OpenAppSec:

```yaml
# config/apisix/apisix.yaml
upstream:
  - id: app-through-waf
    nodes:
      "openappsec:8443": 1
```

### 3. Enable Security Monitoring

Install Wazuh agent on application server:

```bash
# Add to Dockerfile or deployment script
RUN curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | apt-key add - && \
    echo "deb https://packages.wazuh.com/4.x/apt/ stable main" | tee /etc/apt/sources.list.d/wazuh.list && \
    apt-get update && \
    apt-get install -y wazuh-agent
```

## Monitoring & Alerts

### OpenSearch Alerts

Create alerts for security events:

1. **Failed Login Attempts**:
   - Condition: More than 5 failed logins in 5 minutes
   - Action: Send email notification

2. **High Error Rate**:
   - Condition: Error rate > 5% over 10 minutes
   - Action: Trigger incident

3. **Suspicious Activity**:
   - Condition: Unusual API access patterns
   - Action: Alert security team

### Wazuh Rules

Custom security rules in `/var/ossec/etc/rules/local_rules.xml`:

```xml
<group name="local,">
  <rule id="100001" level="10">
    <if_sid>5710</if_sid>
    <description>Multiple failed login attempts</description>
  </rule>
  
  <rule id="100002" level="12">
    <if_sid>5712</if_sid>
    <description>Brute force attack detected</description>
  </rule>
</group>
```

## Backup & Recovery

### Backup Configuration

```bash
# Backup all security data
docker-compose -f docker-compose.security.yml exec opensearch \
  curl -X PUT "localhost:9200/_snapshot/backup" -H 'Content-Type: application/json' -d'
{
  "type": "fs",
  "settings": {
    "location": "/usr/share/opensearch/backup"
  }
}'

# Create snapshot
docker-compose -f docker-compose.security.yml exec opensearch \
  curl -X PUT "localhost:9200/_snapshot/backup/snapshot_1?wait_for_completion=true"
```

### Restore from Backup

```bash
# Restore snapshot
docker-compose -f docker-compose.security.yml exec opensearch \
  curl -X POST "localhost:9200/_snapshot/backup/snapshot_1/_restore"
```

## Troubleshooting

### Common Issues

**1. OpenSearch won't start**
```bash
# Increase vm.max_map_count
sudo sysctl -w vm.max_map_count=262144
echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf
```

**2. Wazuh agent not connecting**
```bash
# Check agent status
/var/ossec/bin/agent_control -l

# Restart agent
systemctl restart wazuh-agent
```

**3. High memory usage**
```bash
# Reduce Java heap size in docker-compose.security.yml
- "OPENSEARCH_JAVA_OPTS=-Xms1g -Xmx1g"
```

### Log Locations

- OpenAppSec: `/var/log/nano_agent/`
- OpenCTI: `docker-compose logs opencti`
- Wazuh: `/var/ossec/logs/`
- OpenSearch: `docker-compose logs opensearch`
- Logstash: `docker-compose logs logstash`

## Performance Tuning

### Resource Allocation

Recommended resources per service:

| Service | CPU | RAM | Disk |
|---------|-----|-----|------|
| OpenAppSec | 1 core | 1GB | 10GB |
| OpenCTI | 2 cores | 4GB | 50GB |
| Wazuh Manager | 2 cores | 2GB | 20GB |
| Wazuh Indexer | 2 cores | 4GB | 100GB |
| OpenSearch | 2 cores | 4GB | 100GB |
| Kubecost | 1 core | 1GB | 10GB |

### Optimization Tips

1. **Enable compression** for log storage
2. **Configure retention policies** (7-30 days)
3. **Use index lifecycle management** in OpenSearch
4. **Enable caching** for frequently accessed data
5. **Monitor resource usage** with Kubecost

## Security Best Practices

1. **Change default passwords** immediately
2. **Enable SSL/TLS** for all services
3. **Configure firewall rules** to restrict access
4. **Regular security updates** for all components
5. **Enable audit logging** for all administrative actions
6. **Implement least privilege** access control
7. **Regular backup** of security data
8. **Monitor for anomalies** continuously

## Compliance

The security stack supports compliance with:

- **PCI DSS**: Payment card industry data security
- **GDPR**: General data protection regulation
- **HIPAA**: Health insurance portability and accountability
- **SOC 2**: Service organization control
- **ISO 27001**: Information security management

## Support & Resources

- OpenAppSec: https://docs.openappsec.io/
- OpenCTI: https://docs.opencti.io/
- Wazuh: https://documentation.wazuh.com/
- OpenSearch: https://opensearch.org/docs/
- Kubecost: https://docs.kubecost.com/

## Next Steps

1. Deploy security stack
2. Configure integration with application
3. Set up monitoring dashboards
4. Configure alerts and notifications
5. Conduct security audit
6. Train team on security tools
7. Establish incident response procedures
