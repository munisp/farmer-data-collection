#!/bin/bash
# PRB-006: Check database persistence configuration
# Ensures no in-memory defaults and DATABASE_URL is required
# Exit 0 if no violations, exit 1 if violations found

set -e

VIOLATIONS=0

echo "Checking database persistence configuration..."

# Check for in-memory SQLite usage in production code
MEMORY_DB=$(grep -rn "':memory:'" \
    --include="*.ts" \
    --include="*.tsx" \
    --include="*.js" \
    server/ 2>/dev/null \
    | grep -v "__tests__" \
    | grep -v "\.test\." \
    | grep -v "\.spec\." \
    | grep -v "node_modules" \
    || true)

if [ -n "$MEMORY_DB" ]; then
    echo "VIOLATION: In-memory SQLite usage found:"
    echo "$MEMORY_DB"
    VIOLATIONS=$((VIOLATIONS + 1))
fi

# Check for hardcoded database URL fallbacks in config files
# Pattern: || "postgresql://..." or || 'postgresql://...'
DB_FALLBACKS=$(grep -rn '|| *["'"'"']postgresql://' \
    --include="*.ts" \
    --include="*.js" \
    server/ drizzle.config.ts 2>/dev/null \
    | grep -v "__tests__" \
    | grep -v "\.test\." \
    | grep -v "node_modules" \
    || true)

if [ -n "$DB_FALLBACKS" ]; then
    echo "VIOLATION: Database URL fallbacks found (should require env var):"
    echo "$DB_FALLBACKS"
    VIOLATIONS=$((VIOLATIONS + 1))
fi

# Check that server/db.ts properly requires DATABASE_URL
if [ -f "server/db.ts" ]; then
    # Check if it returns null/throws when DATABASE_URL is missing (good)
    if grep -q "if (!databaseUrl)" server/db.ts && grep -q "return null\|throw" server/db.ts; then
        echo "server/db.ts: Properly requires DATABASE_URL"
    else
        # Check if there's a fallback (bad)
        if grep -q '|| *["'"'"']' server/db.ts; then
            echo "VIOLATION: server/db.ts has a database URL fallback"
            VIOLATIONS=$((VIOLATIONS + 1))
        fi
    fi
fi

if [ $VIOLATIONS -gt 0 ]; then
    echo ""
    echo "FAILED: Found $VIOLATIONS database persistence violation(s)"
    echo "Production code must require DATABASE_URL env var without fallbacks"
    exit 1
fi

echo "Database persistence configuration is correct"
exit 0
