#!/bin/bash
# PRB-001: Check for hardcoded credentials in infrastructure YAMLs
# Exit 0 if no violations, exit 1 if violations found

set -e

VIOLATIONS=0

echo "Scanning for hardcoded credentials in infrastructure files..."

# Define patterns that indicate hardcoded secrets (not env var references)
# We look for password/secret/key followed by a literal value (not ${...} or $(...))
PATTERNS=(
    'password: *"[^$][^"]*"'
    'password: *'"'"'[^$][^'"'"']*'"'"
    "secret: *\"[^\$][^\"]*\""
    "api_key: *\"[^\$][^\"]*\""
    "access_key: *\"[^\$][^\"]*\""
    "client_secret: *\"[^\$][^\"]*\""
)

# Files to scan
SCAN_PATHS=(
    "k8s/"
    "config/"
    ".github/workflows/"
)

# Also scan docker-compose files
COMPOSE_FILES=$(find . -maxdepth 1 -name 'docker-compose*.yml' -o -name 'docker-compose*.yaml' 2>/dev/null || true)

# Allowlist - these are known placeholders or test values that are acceptable
ALLOWLIST=(
    "CHANGEME"
    "<TO_BE_SET>"
    "your-"
    "example"
    "placeholder"
)

check_file() {
    local file="$1"
    local found=0
    
    for pattern in "${PATTERNS[@]}"; do
        matches=$(grep -nE "$pattern" "$file" 2>/dev/null || true)
        if [ -n "$matches" ]; then
            # Check if match is in allowlist
            while IFS= read -r match; do
                is_allowed=0
                for allowed in "${ALLOWLIST[@]}"; do
                    if echo "$match" | grep -qi "$allowed"; then
                        is_allowed=1
                        break
                    fi
                done
                
                if [ $is_allowed -eq 0 ]; then
                    echo "VIOLATION: $file"
                    echo "  $match"
                    found=1
                fi
            done <<< "$matches"
        fi
    done
    
    return $found
}

# Scan directories
for path in "${SCAN_PATHS[@]}"; do
    if [ -d "$path" ]; then
        while IFS= read -r -d '' file; do
            if ! check_file "$file"; then
                VIOLATIONS=$((VIOLATIONS + 1))
            fi
        done < <(find "$path" -type f \( -name "*.yml" -o -name "*.yaml" \) -print0 2>/dev/null)
    fi
done

# Scan docker-compose files
for file in $COMPOSE_FILES; do
    if [ -f "$file" ]; then
        if ! check_file "$file"; then
            VIOLATIONS=$((VIOLATIONS + 1))
        fi
    fi
done

if [ $VIOLATIONS -gt 0 ]; then
    echo ""
    echo "FAILED: Found $VIOLATIONS file(s) with hardcoded credentials"
    exit 1
fi

echo "No hardcoded credentials found"
exit 0
