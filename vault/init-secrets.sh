#!/bin/bash
# Initialize Vault with FarmConnect production secrets structure
# Run this after Vault is started in dev mode

set -e

VAULT_ADDR="${VAULT_ADDR:-http://localhost:8200}"
VAULT_TOKEN="${VAULT_TOKEN:-farmconnect-dev-token}"

export VAULT_ADDR VAULT_TOKEN

echo "=== Initializing FarmConnect Vault Secrets ==="

# Enable KV v2 secrets engine
vault secrets enable -path=farmconnect -version=2 kv 2>/dev/null || true

# Database credentials
vault kv put farmconnect/database \
  url="postgresql://postgres:postgres@postgres:5432/farmer_data" \
  pool_max=20 \
  pool_idle_timeout=30000 \
  statement_timeout=30000

# Redis configuration
vault kv put farmconnect/redis \
  host="redis" \
  port=6379 \
  password=""

# Kafka configuration
vault kv put farmconnect/kafka \
  brokers="kafka:9092" \
  client_id="farmconnect-app"

# Keycloak (IAM)
vault kv put farmconnect/keycloak \
  url="http://keycloak:8080" \
  realm="farmconnect" \
  client_id="farmconnect-api" \
  client_secret="change-me-in-production" \
  admin_username="admin" \
  admin_password="change-me-in-production"

# JWT signing
vault kv put farmconnect/jwt \
  secret="change-this-to-a-strong-random-secret-in-production" \
  issuer="farmconnect" \
  audience="farmconnect-api" \
  expiry="24h"

# External API keys
vault kv put farmconnect/external/africas-talking \
  api_key="" \
  username="" \
  sender_id="FarmConnect"

vault kv put farmconnect/external/openweather \
  api_key=""

vault kv put farmconnect/external/meta-whatsapp \
  access_token="" \
  phone_number_id="" \
  verify_token=""

vault kv put farmconnect/external/mojaloop \
  api_url="http://mojaloop-simulator:8444" \
  settlement_account_id=""

# Payment gateways
vault kv put farmconnect/payments/flutterwave \
  public_key="" \
  secret_key="" \
  encryption_key=""

vault kv put farmconnect/payments/paystack \
  public_key="" \
  secret_key=""

# TigerBeetle (financial ledger)
vault kv put farmconnect/tigerbeetle \
  address="tigerbeetle:3000" \
  cluster_id=0

# OpenTelemetry / observability
vault kv put farmconnect/observability \
  jaeger_endpoint="http://jaeger:4318/v1/traces" \
  prometheus_url="http://prometheus:9090"

# ERPNext integration
vault kv put farmconnect/erpnext \
  url="" \
  api_key="" \
  api_secret=""

echo "=== Vault initialization complete ==="
echo "Secrets stored under farmconnect/* path"
vault kv list farmconnect/
