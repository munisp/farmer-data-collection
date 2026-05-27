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
