#!/bin/bash
# PRB-002: Check for generateMock* functions in production code
# Exit 0 if no violations, exit 1 if violations found

set -e

VIOLATIONS=0

echo "Scanning for generateMock* functions in production code..."

# Search for generateMock* patterns in production code
# Exclude test files and __tests__ directories
MATCHES=$(grep -rn "generateMock[A-Za-z0-9_]*" \
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

if [ -n "$MATCHES" ]; then
    echo "VIOLATIONS FOUND:"
    echo "$MATCHES"
    VIOLATIONS=$(echo "$MATCHES" | wc -l)
fi

if [ $VIOLATIONS -gt 0 ]; then
    echo ""
    echo "FAILED: Found $VIOLATIONS generateMock* function(s) in production code"
    echo "These must be removed or moved to test files"
    exit 1
fi

echo "No generateMock* functions found in production code"
exit 0
