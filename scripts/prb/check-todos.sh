#!/bin/bash
# PRB-003: Check for TODO implement or FIXME placeholders in production code
# Exit 0 if no violations, exit 1 if violations found

set -e

VIOLATIONS=0

echo "Scanning for TODO implement and FIXME placeholders..."

# Search for "TODO implement" pattern (case insensitive)
TODO_MATCHES=$(grep -rni "TODO.*implement" \
    --include="*.ts" \
    --include="*.tsx" \
    --include="*.js" \
    --include="*.jsx" \
    server/ client/src/ 2>/dev/null \
    | grep -v "__tests__" \
    | grep -v "\.test\." \
    | grep -v "\.spec\." \
    | grep -v "node_modules" \
    || true)

# Search for FIXME pattern
FIXME_MATCHES=$(grep -rn "FIXME" \
    --include="*.ts" \
    --include="*.tsx" \
    --include="*.js" \
    --include="*.jsx" \
    server/ client/src/ 2>/dev/null \
    | grep -v "__tests__" \
    | grep -v "\.test\." \
    | grep -v "\.spec\." \
    | grep -v "node_modules" \
    || true)

if [ -n "$TODO_MATCHES" ]; then
    echo "TODO implement VIOLATIONS:"
    echo "$TODO_MATCHES"
    VIOLATIONS=$((VIOLATIONS + $(echo "$TODO_MATCHES" | wc -l)))
fi

if [ -n "$FIXME_MATCHES" ]; then
    echo "FIXME VIOLATIONS:"
    echo "$FIXME_MATCHES"
    VIOLATIONS=$((VIOLATIONS + $(echo "$FIXME_MATCHES" | wc -l)))
fi

if [ $VIOLATIONS -gt 0 ]; then
    echo ""
    echo "FAILED: Found $VIOLATIONS TODO implement/FIXME placeholder(s) in production code"
    exit 1
fi

echo "No TODO implement or FIXME placeholders found in production code"
exit 0
