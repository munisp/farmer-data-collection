#!/bin/bash
# Generate TLS certificates for Vault
set -e

CERT_DIR="${1:-/vault/tls}"
DOMAIN="${VAULT_DOMAIN:-vault.farmerplatform.com}"
DAYS="${CERT_VALIDITY_DAYS:-365}"

mkdir -p "$CERT_DIR"

echo "=== Generating Vault TLS certificates ==="
echo "Domain: $DOMAIN"
echo "Output: $CERT_DIR"
echo "Validity: $DAYS days"

# Generate CA key and cert
openssl genrsa -out "$CERT_DIR/ca.key" 4096
openssl req -x509 -new -nodes -key "$CERT_DIR/ca.key" \
  -sha256 -days "$DAYS" \
  -out "$CERT_DIR/ca.crt" \
  -subj "/C=NG/ST=Lagos/L=Lagos/O=FarmConnect/OU=Infrastructure/CN=FarmConnect Vault CA"

# Generate Vault server key
openssl genrsa -out "$CERT_DIR/vault.key" 2048

# Generate CSR with SANs
cat > "$CERT_DIR/vault-csr.conf" << EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = v3_req

[dn]
C = NG
ST = Lagos
L = Lagos
O = FarmConnect
OU = Infrastructure
CN = $DOMAIN

[v3_req]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = $DOMAIN
DNS.2 = vault
DNS.3 = vault.farmconnect.svc.cluster.local
DNS.4 = localhost
IP.1 = 127.0.0.1
IP.2 = 0.0.0.0
EOF

openssl req -new -key "$CERT_DIR/vault.key" \
  -out "$CERT_DIR/vault.csr" \
  -config "$CERT_DIR/vault-csr.conf"

# Sign the certificate
openssl x509 -req -in "$CERT_DIR/vault.csr" \
  -CA "$CERT_DIR/ca.crt" -CAkey "$CERT_DIR/ca.key" \
  -CAcreateserial -out "$CERT_DIR/vault.crt" \
  -days "$DAYS" -sha256 \
  -extfile "$CERT_DIR/vault-csr.conf" \
  -extensions v3_req

# Verify
openssl verify -CAfile "$CERT_DIR/ca.crt" "$CERT_DIR/vault.crt"

# Set permissions
chmod 600 "$CERT_DIR/vault.key" "$CERT_DIR/ca.key"
chmod 644 "$CERT_DIR/vault.crt" "$CERT_DIR/ca.crt"

echo "=== Vault TLS certificate generation complete ==="
echo "CA cert:     $CERT_DIR/ca.crt"
echo "Server cert: $CERT_DIR/vault.crt"
echo "Server key:  $CERT_DIR/vault.key"
