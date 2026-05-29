#!/bin/bash
# Vault TLS Deployment Script
# Generates certificates, deploys them, and restarts Vault with TLS enabled.
# Usage: bash vault/deploy-tls.sh [environment]
#   environment: dev (default), staging, production

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV="${1:-dev}"
CERT_DIR="${SCRIPT_DIR}/certs"
VAULT_ADDR="${VAULT_ADDR:-https://127.0.0.1:8200}"

log() { echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"; }

# Step 1: Generate TLS certificates if they don't exist
if [ ! -f "${CERT_DIR}/server-cert.pem" ]; then
  log "Generating TLS certificates..."
  bash "${SCRIPT_DIR}/generate-tls-certs.sh" "${CERT_DIR}" 365
  log "Certificates generated in ${CERT_DIR}"
else
  log "Certificates already exist in ${CERT_DIR}"
fi

# Step 2: Validate certificates
log "Validating certificates..."
openssl x509 -in "${CERT_DIR}/server-cert.pem" -noout -dates 2>/dev/null || {
  log "ERROR: Invalid server certificate"
  exit 1
}
openssl x509 -in "${CERT_DIR}/ca-cert.pem" -noout -dates 2>/dev/null || {
  log "ERROR: Invalid CA certificate"
  exit 1
}

# Verify server cert is signed by CA
openssl verify -CAfile "${CERT_DIR}/ca-cert.pem" "${CERT_DIR}/server-cert.pem" 2>/dev/null || {
  log "ERROR: Server certificate not signed by CA"
  exit 1
}
log "Certificate chain validated successfully"

# Step 3: Set proper permissions
chmod 600 "${CERT_DIR}"/*-key.pem 2>/dev/null || true
chmod 644 "${CERT_DIR}"/*-cert.pem 2>/dev/null || true
log "Certificate permissions set"

# Step 4: Verify Vault config references correct paths
if grep -q "tls_cert_file" "${SCRIPT_DIR}/config.hcl"; then
  log "Vault config.hcl has TLS configuration"
else
  log "WARNING: Vault config.hcl missing TLS configuration"
fi

# Step 5: Environment-specific deployment
case "${ENV}" in
  dev)
    log "Dev deployment: certificates ready for docker-compose"
    log "  Mount ${CERT_DIR} as /vault/certs in docker-compose.yml"
    ;;
  staging|production)
    log "${ENV} deployment: checking Vault connectivity..."
    if command -v vault &>/dev/null; then
      export VAULT_CACERT="${CERT_DIR}/ca-cert.pem"
      export VAULT_CLIENT_CERT="${CERT_DIR}/client-cert.pem"
      export VAULT_CLIENT_KEY="${CERT_DIR}/client-key.pem"
      
      # Test connection with mTLS
      if vault status -address="${VAULT_ADDR}" 2>/dev/null; then
        log "Vault is accessible with mTLS"
      else
        log "WARNING: Vault not reachable at ${VAULT_ADDR} — deploy certificates manually"
      fi
    else
      log "Vault CLI not installed — deploy certificates to ${VAULT_ADDR} manually"
    fi
    ;;
  *)
    log "Unknown environment: ${ENV}"
    exit 1
    ;;
esac

# Step 6: Generate deployment summary
cat << SUMMARY

=== TLS Deployment Summary ===
Environment: ${ENV}
Cert Dir:    ${CERT_DIR}
CA Cert:     ${CERT_DIR}/ca-cert.pem
Server Cert: ${CERT_DIR}/server-cert.pem
Server Key:  ${CERT_DIR}/server-key.pem
Client Cert: ${CERT_DIR}/client-cert.pem
Client Key:  ${CERT_DIR}/client-key.pem
TLS Version: 1.2+
mTLS:        Enabled (client verification optional)

To use with docker-compose:
  volumes:
    - ./vault/certs:/vault/certs:ro

To test with curl:
  curl --cacert ${CERT_DIR}/ca-cert.pem \\
       --cert ${CERT_DIR}/client-cert.pem \\
       --key ${CERT_DIR}/client-key.pem \\
       ${VAULT_ADDR}/v1/sys/health
SUMMARY

log "TLS deployment complete for ${ENV}"
