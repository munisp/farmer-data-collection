#!/bin/bash
# Generate TLS certificates for Vault production deployment
# Creates: CA cert, server cert, client cert for mTLS
set -euo pipefail

CERT_DIR="${1:-vault/certs}"
DAYS_VALID="${2:-365}"
DOMAIN="${VAULT_DOMAIN:-vault.farmconnect.local}"
ORG="FarmConnect Platform"

mkdir -p "$CERT_DIR"

echo "=== Generating Vault TLS Certificates ==="
echo "Domain: $DOMAIN"
echo "Validity: $DAYS_VALID days"
echo "Output: $CERT_DIR/"

# 1. Generate CA key and certificate
echo "[1/4] Generating Certificate Authority..."
openssl genrsa -out "$CERT_DIR/ca-key.pem" 4096
openssl req -new -x509 -days "$DAYS_VALID" \
  -key "$CERT_DIR/ca-key.pem" \
  -out "$CERT_DIR/ca-cert.pem" \
  -subj "/C=NG/ST=Lagos/L=Lagos/O=$ORG/OU=Infrastructure/CN=FarmConnect Root CA"

# 2. Generate server certificate (for Vault server)
echo "[2/4] Generating Vault server certificate..."
openssl genrsa -out "$CERT_DIR/server-key.pem" 2048

cat > "$CERT_DIR/server-ext.cnf" <<EOF
[req]
distinguished_name = req_dn
req_extensions = v3_req
prompt = no

[req_dn]
C = NG
ST = Lagos
L = Lagos
O = $ORG
OU = Vault
CN = $DOMAIN

[v3_req]
subjectAltName = @alt_names
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt_names]
DNS.1 = $DOMAIN
DNS.2 = vault
DNS.3 = localhost
IP.1 = 127.0.0.1
EOF

openssl req -new \
  -key "$CERT_DIR/server-key.pem" \
  -out "$CERT_DIR/server.csr" \
  -config "$CERT_DIR/server-ext.cnf"

openssl x509 -req -days "$DAYS_VALID" \
  -in "$CERT_DIR/server.csr" \
  -CA "$CERT_DIR/ca-cert.pem" \
  -CAkey "$CERT_DIR/ca-key.pem" \
  -CAcreateserial \
  -out "$CERT_DIR/server-cert.pem" \
  -extensions v3_req \
  -extfile "$CERT_DIR/server-ext.cnf"

# 3. Generate client certificate (for services connecting to Vault)
echo "[3/4] Generating client certificate for services..."
openssl genrsa -out "$CERT_DIR/client-key.pem" 2048

openssl req -new \
  -key "$CERT_DIR/client-key.pem" \
  -out "$CERT_DIR/client.csr" \
  -subj "/C=NG/ST=Lagos/L=Lagos/O=$ORG/OU=Services/CN=farmconnect-services"

openssl x509 -req -days "$DAYS_VALID" \
  -in "$CERT_DIR/client.csr" \
  -CA "$CERT_DIR/ca-cert.pem" \
  -CAkey "$CERT_DIR/ca-key.pem" \
  -CAcreateserial \
  -out "$CERT_DIR/client-cert.pem"

# 4. Set permissions
echo "[4/4] Setting secure permissions..."
chmod 600 "$CERT_DIR"/*-key.pem
chmod 644 "$CERT_DIR"/*-cert.pem "$CERT_DIR"/ca-cert.pem

# Cleanup CSR and temp files
rm -f "$CERT_DIR"/*.csr "$CERT_DIR"/*.cnf "$CERT_DIR"/*.srl

echo ""
echo "=== TLS Certificates Generated ==="
echo "CA certificate:     $CERT_DIR/ca-cert.pem"
echo "Server certificate: $CERT_DIR/server-cert.pem"
echo "Server key:         $CERT_DIR/server-key.pem"
echo "Client certificate: $CERT_DIR/client-cert.pem"
echo "Client key:         $CERT_DIR/client-key.pem"
echo ""
echo "To use with Vault, update vault/config.hcl:"
echo "  listener \"tcp\" {"
echo "    tls_cert_file = \"$CERT_DIR/server-cert.pem\""
echo "    tls_key_file  = \"$CERT_DIR/server-key.pem\""
echo "    tls_client_ca_file = \"$CERT_DIR/ca-cert.pem\""
echo "  }"
