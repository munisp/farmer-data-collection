#!/bin/bash
# Test All 10 User Journeys End-to-End
# Tests the complete orchestration stack

set +e

ORCHESTRATOR_URL="http://localhost:8086"
OLLAMA_URL="http://localhost:8087"
TIGERBEETLE_URL="http://localhost:8084"
LAKEHOUSE_URL="http://localhost:8085"

echo "========================================="
echo "Testing All 10 User Journeys"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

# Helper function to test endpoint
test_endpoint() {
    local name=$1
    local url=$2
    local method=${3:-GET}
    local data=$4
    
    echo -n "Testing $name... "
    
    if [ "$method" = "POST" ]; then
        response=$(curl -s -X POST -H "Content-Type: application/json" -d "$data" "$url" 2>&1)
    else
        response=$(curl -s "$url" 2>&1)
    fi
    
    if echo "$response" | grep -q "success\|healthy\|status"; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        echo "Response: $response"
        ((FAILED++))
        return 1
    fi
}

echo "========================================="
echo "1. Service Health Checks"
echo "========================================="

test_endpoint "Orchestrator Health" "$ORCHESTRATOR_URL/health"
test_endpoint "Ollama AI Health" "$OLLAMA_URL/health"
test_endpoint "TigerBeetle Health" "$TIGERBEETLE_URL/health"
test_endpoint "Lakehouse Health" "$LAKEHOUSE_URL/health"

echo ""
echo "========================================="
echo "2. Journey 1: Registration & First Harvest (USSD)"
echo "========================================="

JOURNEY1_DATA='{
  "journey_type": "registration_harvest",
  "user_id": 1001,
  "data": {
    "phone_number": "+2348012345678",
    "name": "Amina Ibrahim",
    "farm_name": "Amina Cassava Farm",
    "farm_size": 2.5,
    "crop_type": "cassava",
    "quantity": 500,
    "unit": "kg",
    "price_per_unit": 150
  }
}'

test_endpoint "Journey 1: Start Registration" "$ORCHESTRATOR_URL/journey/start" "POST" "$JOURNEY1_DATA"

echo ""
echo "========================================="
echo "3. Journey 2: Daily Expense Tracking (SMS)"
echo "========================================="

JOURNEY2_DATA='{
  "journey_type": "expense_tracking",
  "user_id": 1001,
  "data": {
    "sms_message": "EXP 5000 Fertilizer for cassava farm",
    "phone_number": "+2348012345678"
  }
}'

test_endpoint "Journey 2: Record Expense" "$ORCHESTRATOR_URL/journey/start" "POST" "$JOURNEY2_DATA"

echo ""
echo "========================================="
echo "4. Journey 3: Marketplace Sale (WhatsApp)"
echo "========================================="

JOURNEY3_DATA='{
  "journey_type": "marketplace_sale",
  "user_id": 1001,
  "data": {
    "product_name": "Fresh Tomatoes",
    "quantity": 100,
    "unit": "kg",
    "price": 200,
    "image_url": "https://example.com/tomatoes.jpg",
    "description": "Fresh organic tomatoes from my farm"
  }
}'

test_endpoint "Journey 3: Create Listing" "$ORCHESTRATOR_URL/journey/start" "POST" "$JOURNEY3_DATA"

echo ""
echo "========================================="
echo "5. Journey 4: Weather-Based Planting (USSD + SMS)"
echo "========================================="

JOURNEY4_DATA='{
  "journey_type": "planting_advisory",
  "user_id": 1001,
  "data": {
    "crop_type": "rice",
    "farm_size": 3.0,
    "location_lat": 12.0,
    "location_lng": 8.5
  }
}'

test_endpoint "Journey 4: Request Planting Advisory" "$ORCHESTRATOR_URL/journey/start" "POST" "$JOURNEY4_DATA"

echo ""
echo "========================================="
echo "6. Journey 5: Loan Application (WhatsApp)"
echo "========================================="

JOURNEY5_DATA='{
  "journey_type": "loan_application",
  "user_id": 1001,
  "data": {
    "whatsapp_message": "I need 50000 naira loan for buying fertilizer",
    "phone_number": "+2348012345678"
  }
}'

test_endpoint "Journey 5: Apply for Loan" "$ORCHESTRATOR_URL/journey/start" "POST" "$JOURNEY5_DATA"

# Test Ollama loan parsing
echo -n "Testing Ollama Loan Parsing... "
LOAN_PARSE_RESPONSE=$(curl -s -X POST "$OLLAMA_URL/journey/loan/parse-request?message=I%20need%2050000%20naira%20for%20fertilizer")
if echo "$LOAN_PARSE_RESPONSE" | grep -q "success"; then
    echo -e "${GREEN}✓ PASSED${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC}"
    ((FAILED++))
fi

echo ""
echo "========================================="
echo "7. Journey 6: Crop Disease Detection (WhatsApp + AI)"
echo "========================================="

JOURNEY6_DATA='{
  "journey_type": "disease_management",
  "user_id": 1001,
  "data": {
    "crop_type": "maize",
    "image_url": "https://example.com/diseased-crop.jpg",
    "description": "My maize leaves are turning yellow",
    "phone_number": "+2348012345678"
  }
}'

test_endpoint "Journey 6: Diagnose Disease" "$ORCHESTRATOR_URL/journey/start" "POST" "$JOURNEY6_DATA"

echo ""
echo "========================================="
echo "8. Journey 7: Group Savings (Multi-channel)"
echo "========================================="

JOURNEY7_DATA='{
  "journey_type": "group_savings",
  "user_id": 1001,
  "data": {
    "group_name": "Kano Farmers Cooperative",
    "contribution_amount": 5000,
    "frequency": "weekly",
    "member_count": 20
  }
}'

test_endpoint "Journey 7: Create Group Savings" "$ORCHESTRATOR_URL/journey/start" "POST" "$JOURNEY7_DATA"

echo ""
echo "========================================="
echo "9. Journey 8: Insurance Claim (USSD + WhatsApp)"
echo "========================================="

JOURNEY8_DATA='{
  "journey_type": "insurance_claim",
  "user_id": 1001,
  "data": {
    "policy_id": "POL-2024-001",
    "damage_type": "flood",
    "image_urls": ["https://example.com/flood-damage1.jpg", "https://example.com/flood-damage2.jpg"],
    "description": "Heavy rain damaged 50% of my rice farm",
    "phone_number": "+2348012345678"
  }
}'

test_endpoint "Journey 8: File Insurance Claim" "$ORCHESTRATOR_URL/journey/start" "POST" "$JOURNEY8_DATA"

echo ""
echo "========================================="
echo "10. Journey 9: Market Price Discovery (SMS + WhatsApp)"
echo "========================================="

JOURNEY9_DATA='{
  "journey_type": "market_negotiation",
  "user_id": 1001,
  "data": {
    "product": "onions",
    "quantity": 200,
    "unit": "kg",
    "asking_price": 300,
    "phone_number": "+2348012345678"
  }
}'

test_endpoint "Journey 9: Start Price Negotiation" "$ORCHESTRATOR_URL/journey/start" "POST" "$JOURNEY9_DATA"

echo ""
echo "========================================="
echo "11. Journey 10: Annual Farm Report (WhatsApp)"
echo "========================================="

JOURNEY10_DATA='{
  "journey_type": "annual_report",
  "user_id": 1001,
  "data": {
    "year": 2024,
    "phone_number": "+2348012345678"
  }
}'

test_endpoint "Journey 10: Generate Annual Report" "$ORCHESTRATOR_URL/journey/start" "POST" "$JOURNEY10_DATA"

echo ""
echo "========================================="
echo "12. TigerBeetle Ledger Tests"
echo "========================================="

# Create account
ACCOUNT_DATA='{"user_id": 1001, "currency": "NGN", "ledger": 1}'
test_endpoint "TigerBeetle: Create Account" "$TIGERBEETLE_URL/accounts" "POST" "$ACCOUNT_DATA"

# Check balance
test_endpoint "TigerBeetle: Get Balance" "$TIGERBEETLE_URL/accounts/1001/balance"

# Create transfer
TRANSFER_DATA='{
  "from_user_id": 1001,
  "to_user_id": 1002,
  "amount": 10000,
  "currency": "NGN",
  "reference": "Test transfer",
  "type": "transfer"
}'
test_endpoint "TigerBeetle: Create Transfer" "$TIGERBEETLE_URL/transfers" "POST" "$TRANSFER_DATA"

echo ""
echo "========================================="
echo "13. Lakehouse Analytics Tests"
echo "========================================="

# Ingest event
EVENT_DATA='{
  "user_id": 1001,
  "event_type": "harvest_recorded",
  "data": {"crop": "cassava", "quantity": 500},
  "timestamp": "2024-11-25T22:00:00Z"
}'
test_endpoint "Lakehouse: Ingest Event" "$LAKEHOUSE_URL/events/ingest" "POST" "$EVENT_DATA"

# Get user events
test_endpoint "Lakehouse: Get User Events" "$LAKEHOUSE_URL/events/1001"

# Ingest market price
PRICE_DATA='{
  "product": "cassava",
  "price": 150,
  "unit": "kg",
  "market": "Kano Central Market",
  "timestamp": "2024-11-25T22:00:00Z"
}'
test_endpoint "Lakehouse: Ingest Market Price" "$LAKEHOUSE_URL/market-prices/ingest" "POST" "$PRICE_DATA"

# Get market price
test_endpoint "Lakehouse: Get Market Price" "$LAKEHOUSE_URL/market-prices/cassava"

echo ""
echo "========================================="
echo "14. Ollama AI Tests"
echo "========================================="

# Test text analysis
TEXT_DATA='{
  "text": "I spent 5000 naira on fertilizer today",
  "task": "parse_whatsapp_message"
}'
test_endpoint "Ollama: Text Analysis" "$OLLAMA_URL/analyze/text" "POST" "$TEXT_DATA"

# List models
test_endpoint "Ollama: List Models" "$OLLAMA_URL/models"

echo ""
echo "========================================="
echo "TEST SUMMARY"
echo "========================================="
echo -e "Total Tests: $((PASSED + FAILED))"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}========================================="
    echo "✓ ALL TESTS PASSED!"
    echo "=========================================${NC}"
    exit 0
else
    echo -e "${RED}========================================="
    echo "✗ SOME TESTS FAILED"
    echo "=========================================${NC}"
    exit 1
fi
