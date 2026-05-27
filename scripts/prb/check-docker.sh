#!/bin/bash
# PRB-005: Check that all Dockerfiles build successfully
# Exit 0 if all build, exit 1 if any fail
# Set SKIP_DOCKER_BUILD=1 to skip this check (for CI without Docker)

set -e

if [ "${SKIP_DOCKER_BUILD:-0}" = "1" ]; then
    echo "SKIPPED: Docker build check disabled (SKIP_DOCKER_BUILD=1)"
    exit 0
fi

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "WARNING: Docker not available, skipping Dockerfile build check"
    echo "Set SKIP_DOCKER_BUILD=1 to suppress this warning"
    exit 0
fi

FAILURES=0
TOTAL=0

echo "Finding and building all Dockerfiles..."

# Find all Dockerfiles
DOCKERFILES=$(find . -name 'Dockerfile' -o -name 'Dockerfile.*' 2>/dev/null | grep -v node_modules || true)

for dockerfile in $DOCKERFILES; do
    TOTAL=$((TOTAL + 1))
    dir=$(dirname "$dockerfile")
    name=$(echo "$dir" | sed 's/[^a-zA-Z0-9]/-/g' | sed 's/^-//' | sed 's/-$//')
    
    if [ -z "$name" ] || [ "$name" = "." ]; then
        name="root"
    fi
    
    tag="prb-check/$name:latest"
    
    echo "Building $dockerfile -> $tag"
    
    if docker build "$dir" -f "$dockerfile" -t "$tag" --quiet > /dev/null 2>&1; then
        echo "  SUCCESS: $dockerfile"
    else
        echo "  FAILED: $dockerfile"
        FAILURES=$((FAILURES + 1))
    fi
done

if [ $TOTAL -eq 0 ]; then
    echo "No Dockerfiles found"
    exit 0
fi

if [ $FAILURES -gt 0 ]; then
    echo ""
    echo "FAILED: $FAILURES of $TOTAL Dockerfile(s) failed to build"
    exit 1
fi

echo "All $TOTAL Dockerfile(s) built successfully"
exit 0
