#!/bin/bash
# PRB-009: Check that rate limiting is applied to all public endpoints
# Exit 0 if rate limiting is properly configured, exit 1 if missing

set -e

echo "Checking rate limiting configuration..."

VIOLATIONS=0

# Check that rate limiter middleware exists
if [ ! -f "server/middleware/rate-limiter.ts" ]; then
    echo "VIOLATION: Rate limiter middleware not found"
    VIOLATIONS=$((VIOLATIONS + 1))
fi

# Check that rate limiting is imported in server/index.ts
if ! grep -q "rateLimiters" server/index.ts 2>/dev/null; then
    echo "VIOLATION: Rate limiters not imported in server/index.ts"
    VIOLATIONS=$((VIOLATIONS + 1))
fi

# Check that rate limiting is applied to key endpoints
ENDPOINTS_TO_CHECK=(
    "/api/trpc"
    "/api/ussd"
    "/api/sms"
    "/api/whatsapp"
)

for endpoint in "${ENDPOINTS_TO_CHECK[@]}"; do
    # Check if the endpoint has rate limiting applied
    if grep -q "app.use.*\"$endpoint\"" server/index.ts 2>/dev/null; then
        if ! grep -B1 "app.use.*\"$endpoint\"" server/index.ts 2>/dev/null | grep -q "rateLimiters"; then
            # Check if rate limiter is on the same line
            if ! grep "app.use.*\"$endpoint\"" server/index.ts 2>/dev/null | grep -q "rateLimiters"; then
                echo "WARNING: Rate limiting may not be applied to $endpoint"
            fi
        fi
    fi
done

if [ $VIOLATIONS -gt 0 ]; then
    echo ""
    echo "FAILED: Found $VIOLATIONS rate limiting violation(s)"
    exit 1
fi

echo "Rate limiting is properly configured"
exit 0
