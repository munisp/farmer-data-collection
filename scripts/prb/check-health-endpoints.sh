#!/bin/bash
# PRB-010: Check that health endpoints exist
# Exit 0 if health endpoints are configured, exit 1 if missing

set -e

echo "Checking health endpoint configuration..."

VIOLATIONS=0

# Check for /health or /healthz endpoint
if ! grep -qE "app\.(get|use).*['\"]/(health|healthz)['\"]" server/index.ts 2>/dev/null; then
    echo "VIOLATION: No /health or /healthz endpoint found"
    VIOLATIONS=$((VIOLATIONS + 1))
fi

# Check for /ready or /readyz endpoint (optional but recommended)
if ! grep -qE "app\.(get|use).*['\"]/(ready|readyz)['\"]" server/index.ts 2>/dev/null; then
    echo "INFO: No /readyz endpoint found (recommended for Kubernetes)"
fi

# Check for /metrics endpoint
if ! grep -qE "app\.(get|use).*['\"]/(metrics)['\"]" server/index.ts 2>/dev/null; then
    echo "VIOLATION: No /metrics endpoint found"
    VIOLATIONS=$((VIOLATIONS + 1))
fi

if [ $VIOLATIONS -gt 0 ]; then
    echo ""
    echo "FAILED: Found $VIOLATIONS health endpoint violation(s)"
    exit 1
fi

echo "Health endpoints are properly configured"
exit 0
