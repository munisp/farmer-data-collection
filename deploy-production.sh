#!/bin/bash

set -e

echo "🚀 Starting Production Deployment for Farmer Data Collection Platform"
echo "======================================================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"
command -v docker >/dev/null 2>&1 || { echo -e "${RED}Docker is required but not installed. Aborting.${NC}" >&2; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { echo -e "${RED}Docker Compose is required but not installed. Aborting.${NC}" >&2; exit 1; }
echo -e "${GREEN}✓ Prerequisites met${NC}"

# Create necessary directories
echo -e "${YELLOW}Creating directories...${NC}"
mkdir -p config/mosquitto config/temporal config/apisix logs data/postgres data/redis data/tigerbeetle
echo -e "${GREEN}✓ Directories created${NC}"

# Create Mosquitto configuration
echo -e "${YELLOW}Configuring MQTT broker...${NC}"
cat > config/mosquitto/mosquitto.conf << 'MQTTCONF'
listener 1883
allow_anonymous true
persistence true
persistence_location /mosquitto/data/
log_dest file /mosquitto/log/mosquitto.log
log_dest stdout
log_type all
MQTTCONF
echo -e "${GREEN}✓ MQTT broker configured${NC}"

# Create environment file if not exists
if [ ! -f .env.production ]; then
    echo -e "${YELLOW}Creating production environment file...${NC}"
    cat > .env.production << 'ENVFILE'
# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=changeme_production_password
POSTGRES_DB=farmer_data

# Temporal
TEMPORAL_ADDRESS=temporal:7233

# Kafka
KAFKA_BROKERS=kafka:9092

# Redis
REDIS_HOST=redis:6379
REDIS_PASSWORD=changeme_redis_password

# MQTT
MQTT_BROKER=mqtt://mosquitto:1883
MQTT_USERNAME=admin
MQTT_PASSWORD=changeme_mqtt_password

# API Gateway
APISIX_GATEWAY=http://apisix:9080

# TigerBeetle
TIGERBEETLE_ADDRESS=tigerbeetle:3000

# Feature Services
IOT_SERVICE_URL=http://iot-service:8090
SATELLITE_SERVICE_URL=http://satellite-service:8091
EXPORT_DOCS_SERVICE_URL=http://export-docs-service:8092
MULTI_CURRENCY_SERVICE_URL=http://multi-currency-service:8093
CARBON_CREDITS_SERVICE_URL=http://carbon-credits-service:8094
CERTIFICATION_SERVICE_URL=http://certification-service:8095
EQUIPMENT_RENTAL_SERVICE_URL=http://equipment-rental-service:8096
COLD_STORAGE_SERVICE_URL=http://cold-storage-service:8097

# Monitoring
GRAFANA_ADMIN_PASSWORD=changeme_grafana_password
JAEGER_COLLECTOR_URL=http://jaeger:14268/api/traces
ENVFILE
    echo -e "${YELLOW}⚠️  Please update .env.production with secure passwords!${NC}"
fi

# Initialize TigerBeetle data file
echo -e "${YELLOW}Initializing TigerBeetle...${NC}"
if [ ! -f data/tigerbeetle/0_0.tigerbeetle ]; then
    docker run --rm -v $(pwd)/data/tigerbeetle:/data ghcr.io/tigerbeetle/tigerbeetle:latest format --cluster=0 --replica=0 /data/0_0.tigerbeetle
    echo -e "${GREEN}✓ TigerBeetle initialized${NC}"
else
    echo -e "${GREEN}✓ TigerBeetle already initialized${NC}"
fi

# Pull latest images
echo -e "${YELLOW}Pulling Docker images...${NC}"
docker-compose -f docker-compose.production.yml pull
echo -e "${GREEN}✓ Images pulled${NC}"

# Build custom services
echo -e "${YELLOW}Building custom services...${NC}"
docker-compose -f docker-compose.production.yml build
echo -e "${GREEN}✓ Services built${NC}"

# Start infrastructure services first
echo -e "${YELLOW}Starting infrastructure services...${NC}"
docker-compose -f docker-compose.production.yml up -d postgresql redis kafka zookeeper mosquitto tigerbeetle
echo "Waiting for infrastructure to be ready (30 seconds)..."
sleep 30
echo -e "${GREEN}✓ Infrastructure services started${NC}"

# Start Temporal
echo -e "${YELLOW}Starting Temporal Server...${NC}"
docker-compose -f docker-compose.production.yml up -d temporal temporal-web temporal-admin-tools
echo "Waiting for Temporal to be ready (20 seconds)..."
sleep 20
echo -e "${GREEN}✓ Temporal Server started${NC}"

# Start APISIX Gateway
echo -e "${YELLOW}Starting API Gateway...${NC}"
docker-compose -f docker-compose.production.yml up -d apisix
sleep 5
echo -e "${GREEN}✓ API Gateway started${NC}"

# Start orchestrator and feature services
echo -e "${YELLOW}Starting orchestrator and feature services...${NC}"
docker-compose -f docker-compose.production.yml up -d orchestrator iot-service satellite-service export-docs-service multi-currency-service carbon-credits-service certification-service equipment-rental-service cold-storage-service
echo "Waiting for services to be ready (15 seconds)..."
sleep 15
echo -e "${GREEN}✓ All services started${NC}"

# Show status
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✓ Production Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Service URLs:"
echo "  • Temporal Web UI: http://localhost:8088"
echo "  • Orchestrator API: http://localhost:8089"
echo "  • IoT Service: http://localhost:8090"
echo "  • Satellite Service: http://localhost:8091"
echo "  • MQTT Broker: mqtt://localhost:1883"
echo "  • PostgreSQL: localhost:5432"
echo "  • Redis: localhost:6379"
echo "  • Kafka: localhost:9092"
echo ""
echo "Next steps:"
echo "  1. Update passwords in .env.production"
echo "  2. Configure SSL certificates for production"
echo "  3. Set up monitoring and alerting"
echo "  4. Register IoT devices via API"
echo "  5. Test workflow execution"
echo ""
echo "To view logs: docker-compose -f docker-compose.production.yml logs -f"
echo "To stop: docker-compose -f docker-compose.production.yml down"
echo ""
