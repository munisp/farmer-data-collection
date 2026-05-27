#!/bin/bash

# Master Load Testing Script
# Runs all k6 load tests sequentially with reporting
# Usage: ./tests/load/run-all-tests.sh [BASE_URL]

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
BASE_URL="${1:-http://localhost:3000}"
RESULTS_DIR="tests/load/results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create results directory
mkdir -p "$RESULTS_DIR"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Farmer Platform Load Testing Suite${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Target: $BASE_URL${NC}"
echo -e "${BLUE}Timestamp: $TIMESTAMP${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo -e "${RED}Error: k6 is not installed${NC}"
    echo -e "${YELLOW}Install k6: https://k6.io/docs/getting-started/installation/${NC}"
    exit 1
fi

# Check if target is reachable
echo -e "${YELLOW}Checking target availability...${NC}"
if ! curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/health" | grep -q "200"; then
    echo -e "${RED}Error: Target $BASE_URL is not reachable${NC}"
    echo -e "${YELLOW}Make sure the application is running${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Target is reachable${NC}"
echo ""

# Function to run a test
run_test() {
    local test_name=$1
    local test_file=$2
    local duration=$3
    
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}Running: $test_name${NC}"
    echo -e "${BLUE}Duration: $duration${NC}"
    echo -e "${BLUE}========================================${NC}"
    
    local result_file="$RESULTS_DIR/${test_name}_${TIMESTAMP}.json"
    local summary_file="$RESULTS_DIR/${test_name}_${TIMESTAMP}.txt"
    
    # Run k6 test
    if k6 run \
        --out json="$result_file" \
        --summary-export="$summary_file" \
        -e BASE_URL="$BASE_URL" \
        "$test_file"; then
        echo -e "${GREEN}✓ $test_name completed successfully${NC}"
        return 0
    else
        echo -e "${RED}✗ $test_name failed${NC}"
        return 1
    fi
    
    echo ""
}

# Test suite
TESTS_PASSED=0
TESTS_FAILED=0

# Test 1: Authentication
if run_test "auth" "tests/load/auth-load-test.js" "6 minutes"; then
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

sleep 10

# Test 2: Marketplace
if run_test "marketplace" "tests/load/marketplace-load-test.js" "16 minutes"; then
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

sleep 10

# Test 3: ML Services
if run_test "ml-services" "tests/load/ml-services-load-test.js" "9 minutes"; then
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Final summary
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Load Testing Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Tests Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Tests Failed: $TESTS_FAILED${NC}"
echo -e "${BLUE}Results saved to: $RESULTS_DIR${NC}"
echo -e "${BLUE}========================================${NC}"

# Generate HTML report
echo ""
echo -e "${YELLOW}Generating HTML report...${NC}"

cat > "$RESULTS_DIR/report_${TIMESTAMP}.html" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>Load Test Report - $TIMESTAMP</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        h1 { color: #333; }
        .summary { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .test { background: white; padding: 15px; border-radius: 8px; margin: 10px 0; }
        .passed { border-left: 4px solid #4CAF50; }
        .failed { border-left: 4px solid #f44336; }
        .metric { display: inline-block; margin: 10px 20px 10px 0; }
        .metric-label { font-weight: bold; color: #666; }
        .metric-value { font-size: 1.2em; color: #333; }
    </style>
</head>
<body>
    <h1>Load Test Report</h1>
    <div class="summary">
        <h2>Summary</h2>
        <div class="metric">
            <div class="metric-label">Target</div>
            <div class="metric-value">$BASE_URL</div>
        </div>
        <div class="metric">
            <div class="metric-label">Timestamp</div>
            <div class="metric-value">$TIMESTAMP</div>
        </div>
        <div class="metric">
            <div class="metric-label">Tests Passed</div>
            <div class="metric-value" style="color: #4CAF50;">$TESTS_PASSED</div>
        </div>
        <div class="metric">
            <div class="metric-label">Tests Failed</div>
            <div class="metric-value" style="color: #f44336;">$TESTS_FAILED</div>
        </div>
    </div>
    
    <h2>Test Results</h2>
    <div class="test passed">
        <h3>Authentication Load Test</h3>
        <p>Tests user registration, login, and session management under load</p>
        <p><a href="auth_${TIMESTAMP}.txt">View Summary</a></p>
    </div>
    
    <div class="test passed">
        <h3>Marketplace Load Test</h3>
        <p>Tests product browsing, search, cart operations, and checkout under load</p>
        <p><a href="marketplace_${TIMESTAMP}.txt">View Summary</a></p>
    </div>
    
    <div class="test passed">
        <h3>ML Services Load Test</h3>
        <p>Tests crop yield prediction and price forecasting under load</p>
        <p><a href="ml-services_${TIMESTAMP}.txt">View Summary</a></p>
    </div>
</body>
</html>
EOF

echo -e "${GREEN}✓ HTML report generated: $RESULTS_DIR/report_${TIMESTAMP}.html${NC}"

# Exit with appropriate code
if [ $TESTS_FAILED -gt 0 ]; then
    exit 1
else
    exit 0
fi
