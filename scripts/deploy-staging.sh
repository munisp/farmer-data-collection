#!/bin/bash

# Staging Deployment Script for Farmer Data Collection Platform
# This script automates the deployment process to staging environment

set -e  # Exit on error
set -u  # Exit on undefined variable

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
STAGING_SERVER="staging.farmer-app.com"
STAGING_USER="deploy"
STAGING_DIR="/var/www/farmer-app"
BACKUP_DIR="/var/backups/farmer-app"
GIT_BRANCH="staging"

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

# Pre-deployment checks
log_info "Starting staging deployment..."

# Check if git branch is clean
if [[ -n $(git status -s) ]]; then
    log_error "Git working directory is not clean. Commit or stash changes first."
    exit 1
fi

# Check if on correct branch
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "$GIT_BRANCH" ]]; then
    log_warn "Not on $GIT_BRANCH branch. Current branch: $CURRENT_BRANCH"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Run tests
log_info "Running tests..."
if ! pnpm test --run; then
    log_error "Tests failed. Aborting deployment."
    exit 1
fi

# Build application
log_info "Building application..."
if ! pnpm build; then
    log_error "Build failed. Aborting deployment."
    exit 1
fi

# Create deployment package
log_info "Creating deployment package..."
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PACKAGE_NAME="farmer-app-staging-${TIMESTAMP}.tar.gz"

tar -czf "$PACKAGE_NAME" \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='*.log' \
    --exclude='.env.local' \
    dist/ \
    server/ \
    drizzle/ \
    package.json \
    pnpm-lock.yaml \
    .env.staging

log_info "Package created: $PACKAGE_NAME"

# Upload to staging server
log_info "Uploading to staging server..."
scp "$PACKAGE_NAME" "${STAGING_USER}@${STAGING_SERVER}:/tmp/"

# Deploy on staging server
log_info "Deploying on staging server..."
ssh "${STAGING_USER}@${STAGING_SERVER}" << EOF
    set -e
    
    # Create backup
    echo "Creating backup..."
    mkdir -p ${BACKUP_DIR}
    if [ -d "${STAGING_DIR}" ]; then
        tar -czf ${BACKUP_DIR}/backup-${TIMESTAMP}.tar.gz -C ${STAGING_DIR} .
        echo "Backup created: ${BACKUP_DIR}/backup-${TIMESTAMP}.tar.gz"
    fi
    
    # Stop application
    echo "Stopping application..."
    sudo systemctl stop farmer-app || true
    
    # Extract new version
    echo "Extracting new version..."
    mkdir -p ${STAGING_DIR}
    tar -xzf /tmp/${PACKAGE_NAME} -C ${STAGING_DIR}
    
    # Install dependencies
    echo "Installing dependencies..."
    cd ${STAGING_DIR}
    pnpm install --prod
    
    # Copy environment file
    echo "Configuring environment..."
    cp .env.staging .env.local
    
    # Run database migrations
    echo "Running database migrations..."
    pnpm db:push
    
    # Set permissions
    echo "Setting permissions..."
    sudo chown -R www-data:www-data ${STAGING_DIR}
    
    # Start application
    echo "Starting application..."
    sudo systemctl start farmer-app
    
    # Wait for application to start
    echo "Waiting for application to start..."
    sleep 5
    
    # Health check
    echo "Performing health check..."
    if curl -f http://localhost:3001/health > /dev/null 2>&1; then
        echo "Health check passed!"
    else
        echo "Health check failed! Rolling back..."
        sudo systemctl stop farmer-app
        tar -xzf ${BACKUP_DIR}/backup-${TIMESTAMP}.tar.gz -C ${STAGING_DIR}
        sudo systemctl start farmer-app
        exit 1
    fi
    
    # Cleanup
    echo "Cleaning up..."
    rm /tmp/${PACKAGE_NAME}
    
    echo "Deployment completed successfully!"
EOF

# Cleanup local package
rm "$PACKAGE_NAME"

# Post-deployment verification
log_info "Verifying deployment..."
if curl -f "https://${STAGING_SERVER}/health" > /dev/null 2>&1; then
    log_info "Deployment verified successfully!"
else
    log_error "Deployment verification failed!"
    exit 1
fi

# Send deployment notification (optional)
log_info "Sending deployment notification..."
# Add your notification logic here (Slack, email, etc.)

log_info "Staging deployment completed successfully!"
log_info "Staging URL: https://${STAGING_SERVER}"
log_info "Deployment time: $(date)"
