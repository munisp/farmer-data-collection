#!/bin/bash

#######################################################################
# Enterprise Infrastructure Deployment Script
# 
# This script deploys the complete enterprise infrastructure for the
# Farmer Data Collection Platform
#######################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js first."
        exit 1
    fi
    
    # Check pnpm
    if ! command -v pnpm &> /dev/null; then
        log_warn "pnpm is not installed. Installing pnpm..."
        npm install -g pnpm
    fi
    
    log_info "All prerequisites met!"
}

setup_environment() {
    log_info "Setting up environment..."
    
    # Check if .env.enterprise exists
    if [ ! -f .env.enterprise ]; then
        log_warn ".env.enterprise not found. Creating from template..."
        cp .env.enterprise.template .env.enterprise
        log_warn "Please edit .env.enterprise with your configuration before continuing."
        read -p "Press Enter when ready to continue..."
    fi
    
    # Load environment variables
    export $(grep -v '^#' .env.enterprise | xargs)
    
    log_info "Environment configured!"
}

start_infrastructure() {
    log_info "Starting enterprise infrastructure..."
    
    # Start all services
    docker-compose -f docker-compose.enterprise.yml up -d
    
    log_info "Waiting for services to be ready..."
    sleep 30
    
    # Check service health
    log_info "Checking service health..."
    docker-compose -f docker-compose.enterprise.yml ps
}

initialize_services() {
    log_info "Initializing services..."
    
    # Initialize Kafka topics
    log_info "Creating Kafka topics..."
    docker exec -it farmer-kafka kafka-topics --create --topic farmer-events --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1 --if-not-exists || true
    docker exec -it farmer-kafka kafka-topics --create --topic farm-events --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1 --if-not-exists || true
    docker exec -it farmer-kafka kafka-topics --create --topic crop-events --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1 --if-not-exists || true
    docker exec -it farmer-kafka kafka-topics --create --topic livestock-events --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1 --if-not-exists || true
    docker exec -it farmer-kafka kafka-topics --create --topic harvest-events --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1 --if-not-exists || true
    docker exec -it farmer-kafka kafka-topics --create --topic expense-events --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1 --if-not-exists || true
    docker exec -it farmer-kafka kafka-topics --create --topic cache-invalidation --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1 --if-not-exists || true
    docker exec -it farmer-kafka kafka-topics --create --topic audit-trail --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1 --if-not-exists || true
    docker exec -it farmer-kafka kafka-topics --create --topic analytics --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1 --if-not-exists || true
    
    # Initialize Permify schema
    log_info "Loading Permify authorization schema..."
    docker exec -it farmer-permify permify schema write --file /config/permify/schema.perm || log_warn "Failed to load Permify schema (may need manual loading)"
    
    # Initialize TigerBeetle
    log_info "Initializing TigerBeetle cluster..."
    docker exec -it farmer-tigerbeetle tigerbeetle format --cluster=0 --replica=0 --replica-count=1 /data/cluster_0_replica_0.tigerbeetle || log_warn "TigerBeetle already initialized"
    docker-compose -f docker-compose.enterprise.yml restart tigerbeetle
    
    log_info "Services initialized!"
}

setup_database() {
    log_info "Setting up database..."
    
    # Install dependencies
    pnpm install
    
    # Run migrations
    pnpm db:push
    
    log_info "Database setup complete!"
}

start_application() {
    log_info "Starting application server..."
    
    # Build application
    pnpm build
    
    # Start in background
    pnpm start &
    
    log_info "Application server started!"
}

verify_deployment() {
    log_info "Verifying deployment..."
    
    # Check application health
    sleep 5
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
        log_info "✓ Application is healthy"
    else
        log_warn "✗ Application health check failed"
    fi
    
    # Check Kafka
    if docker exec farmer-kafka kafka-broker-api-versions --bootstrap-server localhost:9092 > /dev/null 2>&1; then
        log_info "✓ Kafka is healthy"
    else
        log_warn "✗ Kafka health check failed"
    fi
    
    # Check Permify
    if curl -f http://localhost:3476/healthz > /dev/null 2>&1; then
        log_info "✓ Permify is healthy"
    else
        log_warn "✗ Permify health check failed"
    fi
    
    # Check Redis
    if docker exec farmer-redis redis-cli -a ${REDIS_PASSWORD} ping > /dev/null 2>&1; then
        log_info "✓ Redis is healthy"
    else
        log_warn "✗ Redis health check failed"
    fi
    
    # Check PostgreSQL
    if docker exec farmer-postgres pg_isready -U ${POSTGRES_USER} > /dev/null 2>&1; then
        log_info "✓ PostgreSQL is healthy"
    else
        log_warn "✗ PostgreSQL health check failed"
    fi
    
    log_info "Deployment verification complete!"
}

print_urls() {
    log_info "==================================="
    log_info "Deployment Complete!"
    log_info "==================================="
    echo ""
    log_info "Access your services at:"
    echo ""
    echo "  Application:      http://localhost:3000"
    echo "  Kafka UI:         http://localhost:8080"
    echo "  Permify:          http://localhost:3476"
    echo "  Grafana:          http://localhost:3002 (admin/admin)"
    echo "  Prometheus:       http://localhost:9090"
    echo "  Jaeger:           http://localhost:16686"
    echo "  Wazuh Dashboard:  http://localhost:5601"
    echo "  OpenCTI:          http://localhost:8081"
    echo "  Dapr Dashboard:   http://localhost:8085"
    echo ""
    log_info "==================================="
}

cleanup() {
    log_info "Cleaning up..."
    docker-compose -f docker-compose.enterprise.yml down
    log_info "Cleanup complete!"
}

# Main deployment flow
main() {
    log_info "Starting enterprise infrastructure deployment..."
    
    check_prerequisites
    setup_environment
    start_infrastructure
    initialize_services
    setup_database
    start_application
    verify_deployment
    print_urls
    
    log_info "Deployment completed successfully!"
}

# Handle script arguments
case "${1:-}" in
    start)
        main
        ;;
    stop)
        cleanup
        ;;
    restart)
        cleanup
        sleep 5
        main
        ;;
    status)
        docker-compose -f docker-compose.enterprise.yml ps
        ;;
    logs)
        docker-compose -f docker-compose.enterprise.yml logs -f
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs}"
        echo ""
        echo "Commands:"
        echo "  start    - Deploy and start all enterprise services"
        echo "  stop     - Stop all enterprise services"
        echo "  restart  - Restart all enterprise services"
        echo "  status   - Show status of all services"
        echo "  logs     - Show logs from all services"
        exit 1
        ;;
esac
