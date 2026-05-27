#!/bin/bash
# PRB-012: Check database migrations are properly configured
# Exit 0 if migrations are configured, exit 1 if issues found

set -e

echo "Checking database migration configuration..."

VIOLATIONS=0

# Check for drizzle migrations directory
if [ ! -d "drizzle/migrations" ]; then
    echo "INFO: No drizzle/migrations directory found"
    echo "Run 'npx drizzle-kit generate' to create migrations"
fi

# Check for drizzle config
if [ ! -f "drizzle.config.ts" ] && [ ! -f "drizzle.config.js" ]; then
    echo "VIOLATION: No drizzle config file found"
    VIOLATIONS=$((VIOLATIONS + 1))
fi

# Check that schema files exist
SCHEMA_FILES=$(find drizzle -name "*.ts" -type f 2>/dev/null | grep -v migrations | head -5)
if [ -z "$SCHEMA_FILES" ]; then
    echo "VIOLATION: No schema files found in drizzle/"
    VIOLATIONS=$((VIOLATIONS + 1))
else
    echo "Found schema files:"
    echo "$SCHEMA_FILES" | while read f; do echo "  - $f"; done
fi

# Check for migration scripts in package.json
if grep -q "drizzle-kit" package.json 2>/dev/null; then
    echo "drizzle-kit is configured in package.json"
else
    echo "INFO: drizzle-kit not found in package.json"
fi

if [ $VIOLATIONS -gt 0 ]; then
    echo ""
    echo "FAILED: Found $VIOLATIONS migration configuration issue(s)"
    exit 1
fi

echo "Database migration configuration is correct"
exit 0
