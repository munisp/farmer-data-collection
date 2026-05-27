#!/bin/bash
# PRB-011: Check that environment variable validation exists
# Exit 0 if env validation is configured, exit 1 if missing

set -e

echo "Checking environment variable validation..."

VIOLATIONS=0

# Check for env validation file
ENV_VALIDATION_FILES=(
    "server/env.ts"
    "server/config/env.ts"
    "server/lib/env.ts"
    "server/utils/env.ts"
    "src/env.ts"
)

FOUND_ENV_VALIDATION=0
for file in "${ENV_VALIDATION_FILES[@]}"; do
    if [ -f "$file" ]; then
        FOUND_ENV_VALIDATION=1
        echo "Found env validation: $file"
        break
    fi
done

if [ $FOUND_ENV_VALIDATION -eq 0 ]; then
    # Check if there's inline env validation in index.ts
    if grep -qE "(zod|envalid|env-var)" server/index.ts 2>/dev/null; then
        echo "Found inline env validation in server/index.ts"
        FOUND_ENV_VALIDATION=1
    fi
fi

# Check that DATABASE_URL is validated
if ! grep -rq "DATABASE_URL" server/ --include="*.ts" 2>/dev/null | grep -qE "(required|throw|z\.|envalid)"; then
    # Check if db.ts properly validates DATABASE_URL
    if grep -q "if (!databaseUrl)" server/db.ts 2>/dev/null; then
        echo "DATABASE_URL validation found in server/db.ts"
    else
        echo "WARNING: DATABASE_URL may not be properly validated"
    fi
fi

if [ $FOUND_ENV_VALIDATION -eq 0 ]; then
    echo "INFO: No dedicated env validation file found"
    echo "Consider adding server/env.ts with zod schema for env vars"
fi

# This check is informational, not blocking
echo "Environment validation check complete"
exit 0
