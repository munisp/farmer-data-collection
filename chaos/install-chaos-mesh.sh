#!/bin/bash

# Chaos Mesh Installation Script
# Installs and configures Chaos Mesh for chaos engineering experiments
# Usage: ./chaos/install-chaos-mesh.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Chaos Mesh Installation${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}Error: kubectl is not installed${NC}"
    echo -e "${YELLOW}Install kubectl: https://kubernetes.io/docs/tasks/tools/${NC}"
    exit 1
fi

# Check if helm is installed
if ! command -v helm &> /dev/null; then
    echo -e "${YELLOW}Installing Helm...${NC}"
    curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
fi

echo -e "${GREEN}✓ Prerequisites installed${NC}"
echo ""

# Add Chaos Mesh Helm repository
echo -e "${BLUE}Adding Chaos Mesh Helm repository...${NC}"
helm repo add chaos-mesh https://charts.chaos-mesh.org
helm repo update

echo -e "${GREEN}✓ Helm repository added${NC}"
echo ""

# Create namespace
echo -e "${BLUE}Creating chaos-mesh namespace...${NC}"
kubectl create namespace chaos-mesh || echo "Namespace already exists"

echo -e "${GREEN}✓ Namespace created${NC}"
echo ""

# Install Chaos Mesh
echo -e "${BLUE}Installing Chaos Mesh...${NC}"
helm install chaos-mesh chaos-mesh/chaos-mesh \
  --namespace=chaos-mesh \
  --set chaosDaemon.runtime=containerd \
  --set chaosDaemon.socketPath=/run/containerd/containerd.sock \
  --set dashboard.create=true \
  --set dashboard.securityMode=false

echo -e "${GREEN}✓ Chaos Mesh installed${NC}"
echo ""

# Wait for pods to be ready
echo -e "${BLUE}Waiting for Chaos Mesh pods to be ready...${NC}"
kubectl wait --for=condition=Ready pods --all -n chaos-mesh --timeout=300s

echo -e "${GREEN}✓ All pods are ready${NC}"
echo ""

# Port forward dashboard
echo -e "${BLUE}Setting up port forwarding for Chaos Dashboard...${NC}"
echo -e "${YELLOW}Run the following command to access the dashboard:${NC}"
echo -e "${GREEN}kubectl port-forward -n chaos-mesh svc/chaos-dashboard 2333:2333${NC}"
echo -e "${YELLOW}Then open: http://localhost:2333${NC}"

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Chaos Mesh Installation Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Dashboard: http://localhost:2333"
echo -e "Namespace: chaos-mesh"
echo -e "${BLUE}========================================${NC}"
