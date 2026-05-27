#!/bin/bash

# ============================================================================
# Webhook Testing Script (Bash/curl version)
# ============================================================================
#
# Simple curl-based tests for Africa's Talking webhooks
# Use this if you don't want to run the TypeScript version
#
# Usage:
#   chmod +x scripts/test-webhooks.sh
#   ./scripts/test-webhooks.sh [ussd|sms|whatsapp|all]
#
# ============================================================================

set -e

# Configuration
APP_URL="${APP_URL:-http://localhost:3000}"
TEST_PHONE="+254712345678"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASS_COUNT=0
FAIL_COUNT=0

# Functions
print_header() {
  echo ""
  echo "================================================================================"
  echo "$1"
  echo "================================================================================"
  echo ""
}

print_test() {
  echo -e "${YELLOW}Testing:${NC} $1"
}

print_pass() {
  echo -e "${GREEN}✅ PASS:${NC} $1"
  ((PASS_COUNT++))
  echo ""
}

print_fail() {
  echo -e "${RED}❌ FAIL:${NC} $1"
  ((FAIL_COUNT++))
  echo ""
}

# Test USSD Webhook
test_ussd() {
  print_header "USSD Webhook Tests"

  # Test 1: Initial dial
  print_test "Initial dial (empty text)"
  RESPONSE=$(curl -s -X POST "${APP_URL}/api/trpc/messaging.ussdCallback" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "sessionId=test_001&serviceCode=*384*1234#&phoneNumber=${TEST_PHONE}&text=")
  
  if [[ $RESPONSE == CON* ]]; then
    print_pass "Returned welcome menu"
    echo "Response: ${RESPONSE:0:100}..."
  else
    print_fail "Expected CON response, got: ${RESPONSE:0:100}"
  fi

  # Test 2: Menu selection
  print_test "Menu navigation (select 1)"
  RESPONSE=$(curl -s -X POST "${APP_URL}/api/trpc/messaging.ussdCallback" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "sessionId=test_002&serviceCode=*384*1234#&phoneNumber=${TEST_PHONE}&text=1")
  
  if [[ $RESPONSE == CON* ]] || [[ $RESPONSE == END* ]]; then
    print_pass "Returned valid response"
    echo "Response: ${RESPONSE:0:100}..."
  else
    print_fail "Invalid response: ${RESPONSE:0:100}"
  fi

  # Test 3: Invalid input
  print_test "Invalid input handling"
  RESPONSE=$(curl -s -X POST "${APP_URL}/api/trpc/messaging.ussdCallback" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "sessionId=test_003&serviceCode=*384*1234#&phoneNumber=${TEST_PHONE}&text=999")
  
  if [[ -n $RESPONSE ]]; then
    print_pass "Handled invalid input gracefully"
    echo "Response: ${RESPONSE:0:100}..."
  else
    print_fail "No response received"
  fi
}

# Test SMS Webhook
test_sms() {
  print_header "SMS Webhook Tests"

  # Test 1: HELP command
  print_test "HELP command"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${APP_URL}/api/trpc/messaging.smsCallback" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "from=${TEST_PHONE}&to=1234&text=HELP&date=$(date -u +%Y-%m-%dT%H:%M:%SZ)&id=test_sms_001")
  
  if [[ $STATUS == 200 ]]; then
    print_pass "Processed HELP command successfully"
  else
    print_fail "Failed with status $STATUS"
  fi

  # Test 2: REGISTER command
  print_test "REGISTER command"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${APP_URL}/api/trpc/messaging.smsCallback" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "from=${TEST_PHONE}&to=1234&text=REGISTER John Doe&date=$(date -u +%Y-%m-%dT%H:%M:%SZ)&id=test_sms_002")
  
  if [[ $STATUS == 200 ]]; then
    print_pass "Processed REGISTER command successfully"
  else
    print_fail "Failed with status $STATUS"
  fi

  # Test 3: HARVEST command
  print_test "HARVEST command"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${APP_URL}/api/trpc/messaging.smsCallback" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "from=${TEST_PHONE}&to=1234&text=HARVEST Maize 100&date=$(date -u +%Y-%m-%dT%H:%M:%SZ)&id=test_sms_003")
  
  if [[ $STATUS == 200 ]]; then
    print_pass "Processed HARVEST command successfully"
  else
    print_fail "Failed with status $STATUS"
  fi

  # Test 4: Invalid command
  print_test "Invalid command handling"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${APP_URL}/api/trpc/messaging.smsCallback" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "from=${TEST_PHONE}&to=1234&text=INVALID COMMAND&date=$(date -u +%Y-%m-%dT%H:%M:%SZ)&id=test_sms_004")
  
  if [[ $STATUS == 200 ]]; then
    print_pass "Handled invalid command gracefully"
  else
    print_fail "Failed with status $STATUS"
  fi
}

# Test WhatsApp Webhook
test_whatsapp() {
  print_header "WhatsApp Webhook Tests"

  # Test 1: Initial greeting
  print_test "Initial greeting"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${APP_URL}/api/trpc/messaging.whatsappCallback" \
    -H "Content-Type: application/json" \
    -d "{\"from\":\"${TEST_PHONE}\",\"to\":\"1234\",\"text\":\"Hi\",\"timestamp\":\"$(date +%s)000\",\"id\":\"test_wa_001\"}")
  
  if [[ $STATUS == 200 ]]; then
    print_pass "Processed greeting successfully"
  else
    print_fail "Failed with status $STATUS"
  fi

  # Test 2: REGISTER command
  print_test "REGISTER command"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${APP_URL}/api/trpc/messaging.whatsappCallback" \
    -H "Content-Type: application/json" \
    -d "{\"from\":\"${TEST_PHONE}\",\"to\":\"1234\",\"text\":\"REGISTER Mary Farmer\",\"timestamp\":\"$(date +%s)000\",\"id\":\"test_wa_002\"}")
  
  if [[ $STATUS == 200 ]]; then
    print_pass "Processed REGISTER command successfully"
  else
    print_fail "Failed with status $STATUS"
  fi

  # Test 3: Natural language
  print_test "Natural language query"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${APP_URL}/api/trpc/messaging.whatsappCallback" \
    -H "Content-Type: application/json" \
    -d "{\"from\":\"${TEST_PHONE}\",\"to\":\"1234\",\"text\":\"I want to record harvest\",\"timestamp\":\"$(date +%s)000\",\"id\":\"test_wa_003\"}")
  
  if [[ $STATUS == 200 ]]; then
    print_pass "Processed natural language successfully"
  else
    print_fail "Failed with status $STATUS"
  fi
}

# Test webhook accessibility
test_accessibility() {
  print_header "Webhook Accessibility Tests"

  # USSD endpoint
  print_test "USSD endpoint accessibility"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${APP_URL}/api/trpc/messaging.ussdCallback" \
    -H "Content-Type: application/json" \
    -d "{}")
  
  if [[ $STATUS -lt 500 ]]; then
    print_pass "Endpoint accessible at ${APP_URL}/api/trpc/messaging.ussdCallback"
  else
    print_fail "Server error ($STATUS)"
  fi

  # SMS endpoint
  print_test "SMS endpoint accessibility"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${APP_URL}/api/trpc/messaging.smsCallback" \
    -H "Content-Type: application/json" \
    -d "{}")
  
  if [[ $STATUS -lt 500 ]]; then
    print_pass "Endpoint accessible at ${APP_URL}/api/trpc/messaging.smsCallback"
  else
    print_fail "Server error ($STATUS)"
  fi

  # WhatsApp endpoint
  print_test "WhatsApp endpoint accessibility"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${APP_URL}/api/trpc/messaging.whatsappCallback" \
    -H "Content-Type: application/json" \
    -d "{}")
  
  if [[ $STATUS -lt 500 ]]; then
    print_pass "Endpoint accessible at ${APP_URL}/api/trpc/messaging.whatsappCallback"
  else
    print_fail "Server error ($STATUS)"
  fi
}

# Print results
print_results() {
  print_header "Test Results"
  echo "Passed: $PASS_COUNT"
  echo "Failed: $FAIL_COUNT"
  echo ""

  if [[ $FAIL_COUNT -gt 0 ]]; then
    echo -e "${RED}❌ Some tests FAILED. Please review the errors above.${NC}"
    exit 1
  else
    echo -e "${GREEN}✅ All tests PASSED! Webhooks are ready for production.${NC}"
    exit 0
  fi
}

# Main
main() {
  TARGET="${1:-all}"

  clear
  echo "🧪 Webhook Testing Script (Bash/curl)"
  echo "📍 Testing against: $APP_URL"
  echo "📱 Test phone: $TEST_PHONE"

  # Always test accessibility first
  test_accessibility

  case $TARGET in
    ussd)
      test_ussd
      ;;
    sms)
      test_sms
      ;;
    whatsapp)
      test_whatsapp
      ;;
    all)
      test_ussd
      test_sms
      test_whatsapp
      ;;
    *)
      echo "Unknown target: $TARGET"
      echo "Available targets: ussd, sms, whatsapp, all"
      exit 1
      ;;
  esac

  print_results
}

main "$@"
