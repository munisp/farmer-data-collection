#!/bin/bash

# Create Let's Encrypt SSL automation
cat > certbot-setup.sh << 'SSLSCRIPT'
#!/bin/bash
set -e

echo "🔒 Setting up Let's Encrypt SSL Certificates"
echo "============================================="

# Install certbot if not present
if ! command -v certbot &> /dev/null; then
    echo "Installing certbot..."
    sudo apt-get update
    sudo apt-get install -y certbot python3-certbot-nginx
fi

# Domain configuration
DOMAIN=${DOMAIN:-"farmer-platform.example.com"}
EMAIL=${SSL_EMAIL:-"admin@example.com"}

echo "Obtaining SSL certificate for $DOMAIN..."
sudo certbot certonly --standalone \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    -d "$DOMAIN" \
    -d "api.$DOMAIN" \
    -d "temporal.$DOMAIN" \
    -d "grafana.$DOMAIN"

# Set up auto-renewal
echo "Setting up automatic renewal..."
sudo tee /etc/cron.d/certbot-renew << EOF
0 0,12 * * * root certbot renew --quiet --post-hook "docker-compose -f /home/ubuntu/farmer-data-collection/docker-compose.production.yml restart apisix"
EOF

echo "✓ SSL certificates configured successfully!"
echo "Certificate location: /etc/letsencrypt/live/$DOMAIN/"
SSLSCRIPT

chmod +x certbot-setup.sh

# Create Grafana alerting configuration
mkdir -p config/grafana/provisioning/alerting
cat > config/grafana/provisioning/alerting/alerts.yml << 'ALERTYML'
apiVersion: 1

groups:
  - orgId: 1
    name: Workflow Failures
    folder: Farmer Platform
    interval: 1m
    rules:
      - uid: workflow_failure_rate
        title: High Workflow Failure Rate
        condition: C
        data:
          - refId: A
            relativeTimeRange:
              from: 600
              to: 0
            datasourceUid: prometheus
            model:
              expr: rate(temporal_workflow_failed_total[5m])
              refId: A
          - refId: B
            relativeTimeRange:
              from: 0
              to: 0
            datasourceUid: __expr__
            model:
              conditions:
                - evaluator:
                    params: [0.1]
                    type: gt
                  operator:
                    type: and
                  query:
                    params: [A]
                  reducer:
                    type: last
                  type: query
              refId: B
              type: threshold
        noDataState: NoData
        execErrState: Alerting
        for: 5m
        annotations:
          description: Workflow failure rate is above 10% ({{ $values.A.Value }})
          summary: High workflow failure rate detected
        labels:
          severity: critical
          team: platform

      - uid: service_down
        title: Service Down
        condition: C
        data:
          - refId: A
            relativeTimeRange:
              from: 300
              to: 0
            datasourceUid: prometheus
            model:
              expr: up{job=~"temporal|orchestrator|iot-service"}
              refId: A
          - refId: B
            datasourceUid: __expr__
            model:
              conditions:
                - evaluator:
                    params: [1]
                    type: lt
                  operator:
                    type: and
                  query:
                    params: [A]
                  reducer:
                    type: last
                  type: query
              refId: B
              type: threshold
        noDataState: Alerting
        execErrState: Alerting
        for: 2m
        annotations:
          description: Service {{ $labels.job }} is down
          summary: Critical service unavailable
        labels:
          severity: critical
          team: sre

  - orgId: 1
    name: Performance Degradation
    folder: Farmer Platform
    interval: 5m
    rules:
      - uid: high_latency
        title: High API Latency
        condition: C
        data:
          - refId: A
            relativeTimeRange:
              from: 600
              to: 0
            datasourceUid: prometheus
            model:
              expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
              refId: A
          - refId: B
            datasourceUid: __expr__
            model:
              conditions:
                - evaluator:
                    params: [2]
                    type: gt
                  operator:
                    type: and
                  query:
                    params: [A]
                  reducer:
                    type: last
                  type: query
              refId: B
              type: threshold
        for: 10m
        annotations:
          description: P95 latency is {{ $values.A.Value }}s (threshold: 2s)
          summary: API response time degraded
        labels:
          severity: warning
          team: platform
ALERTYML

# Create PagerDuty integration
cat > config/grafana/provisioning/alerting/contact-points.yml << 'CONTACTYML'
apiVersion: 1

contactPoints:
  - orgId: 1
    name: PagerDuty Critical
    receivers:
      - uid: pagerduty_critical
        type: pagerduty
        settings:
          integrationKey: ${PAGERDUTY_INTEGRATION_KEY}
          severity: critical
          class: workflow_failure
          component: temporal_orchestrator

  - orgId: 1
    name: Slack Alerts
    receivers:
      - uid: slack_alerts
        type: slack
        settings:
          url: ${SLACK_WEBHOOK_URL}
          title: "{{ .GroupLabels.alertname }}"
          text: "{{ range .Alerts }}{{ .Annotations.description }}\n{{ end }}"

  - orgId: 1
    name: Email Ops Team
    receivers:
      - uid: email_ops
        type: email
        settings:
          addresses: ops-team@example.com
          singleEmail: true
CONTACTYML

# Create notification policies
cat > config/grafana/provisioning/alerting/policies.yml << 'POLICYYML'
apiVersion: 1

policies:
  - orgId: 1
    receiver: Slack Alerts
    group_by: ['alertname', 'severity']
    group_wait: 30s
    group_interval: 5m
    repeat_interval: 4h
    routes:
      - receiver: PagerDuty Critical
        matchers:
          - severity = critical
        continue: true
        group_wait: 10s
        repeat_interval: 30m
      
      - receiver: Email Ops Team
        matchers:
          - severity = warning
        group_wait: 1m
        repeat_interval: 12h
POLICYYML

# Create on-call rotation configuration
cat > config/on-call-rotation.yml << 'ONCALLYML'
# On-Call Rotation Schedule for Farmer Data Collection Platform
# Integrates with PagerDuty for automated escalation

teams:
  - name: Platform Engineering
    members:
      - name: Primary Engineer
        email: engineer1@example.com
        phone: +234-XXX-XXX-XXXX
        pagerduty_id: PXXXXXX
      
      - name: Secondary Engineer
        email: engineer2@example.com
        phone: +234-XXX-XXX-XXXX
        pagerduty_id: PYYYYYYY

rotation:
  schedule: weekly
  timezone: Africa/Lagos
  handoff_time: "09:00"
  
escalation_policy:
  - level: 1
    timeout: 5m
    notify: primary_on_call
  
  - level: 2
    timeout: 10m
    notify: secondary_on_call
  
  - level: 3
    timeout: 15m
    notify: team_lead

incident_response:
  critical:
    - Check Temporal Web UI for workflow status
    - Review Grafana dashboards for service health
    - Check logs: docker-compose logs -f --tail=100
    - Execute remediation scripts from scripts/remediation/
  
  warning:
    - Document issue in incident log
    - Monitor for escalation
    - Prepare remediation if needed
ONCALLYML

# Create incident response automation
mkdir -p scripts/incident-response
cat > scripts/incident-response/auto-respond.sh << 'INCIDENTSCRIPT'
#!/bin/bash

ALERT_TYPE=$1
SERVICE=$2

case $ALERT_TYPE in
  "workflow_failure")
    echo "Investigating workflow failures..."
    # Get failed workflows from Temporal
    docker exec temporal-admin-tools tctl workflow list --query "ExecutionStatus='Failed'" --limit 10
    ;;
  
  "service_down")
    echo "Attempting to restart $SERVICE..."
    docker-compose -f docker-compose.production.yml restart $SERVICE
    sleep 10
    docker-compose -f docker-compose.production.yml ps $SERVICE
    ;;
  
  "high_latency")
    echo "Checking system resources..."
    docker stats --no-stream
    ;;
  
  *)
    echo "Unknown alert type: $ALERT_TYPE"
    ;;
esac
INCIDENTSCRIPT

chmod +x scripts/incident-response/auto-respond.sh

echo "✅ SSL and monitoring configuration created successfully!"
echo ""
echo "Next steps:"
echo "1. Update .env.production with:"
echo "   - DOMAIN=your-domain.com"
echo "   - SSL_EMAIL=your-email@example.com"
echo "   - PAGERDUTY_INTEGRATION_KEY=your-key"
echo "   - SLACK_WEBHOOK_URL=your-webhook-url"
echo ""
echo "2. Run: ./certbot-setup.sh"
echo "3. Restart services: docker-compose -f docker-compose.production.yml restart"
