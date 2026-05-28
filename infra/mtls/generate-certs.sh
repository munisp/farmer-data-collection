#!/usr/bin/env bash
# mTLS Certificate Generation Script for FarmConnect Inter-Service Communication
# Usage: ./generate-certs.sh [output_dir]
#
# Generates:
#   - CA certificate and key
#   - Server certificate and key for each service
#   - Client certificate and key for each service
#
# All certificates are signed by the same CA for mutual authentication.

set -euo pipefail

OUTPUT_DIR="${1:-./certs}"
DAYS_VALID=365
CA_DAYS_VALID=3650
KEY_SIZE=4096

SERVICES=(
  "api-gateway"
  "delivery-service"
  "mobile-money-service"
  "cold-chain-service"
  "ml-inference-service"
  "tokenization-service"
  "price-prediction-service"
  "sedona-analytics-service"
  "equipment-fleet-service"
  "kyc-service"
  "agri-llm-service"
)

echo "=== FarmConnect mTLS Certificate Generation ==="
echo "Output directory: ${OUTPUT_DIR}"

mkdir -p "${OUTPUT_DIR}/ca" "${OUTPUT_DIR}/server" "${OUTPUT_DIR}/client"

# 1. Generate CA
echo "[1/3] Generating Certificate Authority..."
openssl genrsa -out "${OUTPUT_DIR}/ca/ca.key" ${KEY_SIZE} 2>/dev/null
openssl req -new -x509 -days ${CA_DAYS_VALID} \
  -key "${OUTPUT_DIR}/ca/ca.key" \
  -out "${OUTPUT_DIR}/ca/ca.crt" \
  -subj "/C=KE/ST=Nairobi/O=FarmConnect/OU=Infrastructure/CN=FarmConnect Root CA"
echo "  CA certificate: ${OUTPUT_DIR}/ca/ca.crt"

# 2. Generate server certificates
echo "[2/3] Generating server certificates..."
for SERVICE in "${SERVICES[@]}"; do
  echo "  Generating cert for: ${SERVICE}"
  mkdir -p "${OUTPUT_DIR}/server/${SERVICE}"

  # Generate key
  openssl genrsa -out "${OUTPUT_DIR}/server/${SERVICE}/server.key" 2048 2>/dev/null

  # Create CSR
  openssl req -new \
    -key "${OUTPUT_DIR}/server/${SERVICE}/server.key" \
    -out "${OUTPUT_DIR}/server/${SERVICE}/server.csr" \
    -subj "/C=KE/ST=Nairobi/O=FarmConnect/OU=${SERVICE}/CN=${SERVICE}.farmconnect.local"

  # Create extensions file for SAN
  cat > "${OUTPUT_DIR}/server/${SERVICE}/server.ext" << EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=@alt_names
[alt_names]
DNS.1=${SERVICE}.farmconnect.local
DNS.2=${SERVICE}
DNS.3=localhost
IP.1=127.0.0.1
EOF

  # Sign with CA
  openssl x509 -req -days ${DAYS_VALID} \
    -in "${OUTPUT_DIR}/server/${SERVICE}/server.csr" \
    -CA "${OUTPUT_DIR}/ca/ca.crt" \
    -CAkey "${OUTPUT_DIR}/ca/ca.key" \
    -CAcreateserial \
    -out "${OUTPUT_DIR}/server/${SERVICE}/server.crt" \
    -extfile "${OUTPUT_DIR}/server/${SERVICE}/server.ext" 2>/dev/null

  rm "${OUTPUT_DIR}/server/${SERVICE}/server.csr" "${OUTPUT_DIR}/server/${SERVICE}/server.ext"
done

# 3. Generate client certificates
echo "[3/3] Generating client certificates..."
for SERVICE in "${SERVICES[@]}"; do
  echo "  Generating client cert for: ${SERVICE}"
  mkdir -p "${OUTPUT_DIR}/client/${SERVICE}"

  openssl genrsa -out "${OUTPUT_DIR}/client/${SERVICE}/client.key" 2048 2>/dev/null

  openssl req -new \
    -key "${OUTPUT_DIR}/client/${SERVICE}/client.key" \
    -out "${OUTPUT_DIR}/client/${SERVICE}/client.csr" \
    -subj "/C=KE/ST=Nairobi/O=FarmConnect/OU=${SERVICE}-client/CN=${SERVICE}-client.farmconnect.local"

  cat > "${OUTPUT_DIR}/client/${SERVICE}/client.ext" << EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage=digitalSignature
extendedKeyUsage=clientAuth
EOF

  openssl x509 -req -days ${DAYS_VALID} \
    -in "${OUTPUT_DIR}/client/${SERVICE}/client.csr" \
    -CA "${OUTPUT_DIR}/ca/ca.crt" \
    -CAkey "${OUTPUT_DIR}/ca/ca.key" \
    -CAcreateserial \
    -out "${OUTPUT_DIR}/client/${SERVICE}/client.crt" \
    -extfile "${OUTPUT_DIR}/client/${SERVICE}/client.ext" 2>/dev/null

  rm "${OUTPUT_DIR}/client/${SERVICE}/client.csr" "${OUTPUT_DIR}/client/${SERVICE}/client.ext"
done

echo ""
echo "=== Certificate generation complete ==="
echo ""
echo "Environment variables to set:"
echo "  MTLS_CA_CERT=${OUTPUT_DIR}/ca/ca.crt"
for SERVICE in "${SERVICES[@]}"; do
  SVC_UPPER=$(echo "${SERVICE}" | tr '[:lower:]-' '[:upper:]_')
  echo "  ${SVC_UPPER}_TLS_CERT=${OUTPUT_DIR}/server/${SERVICE}/server.crt"
  echo "  ${SVC_UPPER}_TLS_KEY=${OUTPUT_DIR}/server/${SERVICE}/server.key"
done
echo ""
echo "Verify a certificate:"
echo "  openssl x509 -in ${OUTPUT_DIR}/server/api-gateway/server.crt -text -noout"
echo "  openssl verify -CAfile ${OUTPUT_DIR}/ca/ca.crt ${OUTPUT_DIR}/server/api-gateway/server.crt"
