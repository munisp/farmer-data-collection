#!/bin/bash
# Check All Services Status

echo "========================================="
echo "FARMER DATA COLLECTION PLATFORM"
echo "Service Status Dashboard"
echo "========================================="
echo ""

check_service() {
    local name=$1
    local url=$2
    local port=$3
    
    printf "%-30s %-15s " "$name" "Port $port"
    
    if curl -s --max-time 2 "$url" > /dev/null 2>&1; then
        echo "✅ RUNNING"
        return 0
    else
        echo "❌ DOWN"
        return 1
    fi
}

echo "CORE SERVICES:"
echo "-------------------------------------------"
check_service "Orchestrator Coordinator" "http://localhost:8086/health" "8086"
check_service "TigerBeetle Ledger" "http://localhost:8084/health" "8084"
check_service "Lakehouse Analytics" "http://localhost:8085/health" "8085"
check_service "Ollama AI (llama3.2)" "http://localhost:8087/health" "8087"
check_service "Temporal Server" "http://localhost:8233" "7233/8233"
check_service "Temporal Worker" "http://localhost:7233" "N/A"

echo ""
echo "MIDDLEWARE SERVICES:"
echo "-------------------------------------------"
check_service "Kafka (Mock)" "http://localhost:9092/health" "9092"
check_service "APISIX Gateway (Mock)" "http://localhost:9080/health" "9080"
check_service "Keycloak Auth (Mock)" "http://localhost:8180/health" "8180"
check_service "Permify AuthZ (Mock)" "http://localhost:3476/health" "3476"
check_service "Redis Cache" "http://localhost:6379" "6379"
check_service "PostgreSQL Database" "http://localhost:5432" "5432"

echo ""
echo "WEB APPLICATION:"
echo "-------------------------------------------"
check_service "PWA Frontend" "http://localhost:3000" "3000"

echo ""
echo "========================================="
echo "QUICK STATS"
echo "========================================="

# Count running services
TOTAL=15
RUNNING=$(ps aux | grep -E "python3.*app.py|go run|temporal|ollama" | grep -v grep | wc -l)

echo "Services Running: $RUNNING / $TOTAL"
echo ""

# Database stats
echo "Database Tables: $(PGPASSWORD=postgres psql -h localhost -U postgres -d farmer_data -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null | tr -d ' ')"

# Ollama models
echo "Ollama Models: $(ollama list 2>/dev/null | tail -n +2 | wc -l)"

echo ""
echo "========================================="
echo "ACCESS URLS"
echo "========================================="
echo "Temporal UI:     http://localhost:8233"
echo "Orchestrator:    http://localhost:8086"
echo "APISIX Gateway:  http://localhost:9080"
echo "PWA Frontend:    http://localhost:3000"
echo ""
