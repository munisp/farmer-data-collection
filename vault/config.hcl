storage "file" {
  path = "/vault/data"
}

# Production TLS listener with mTLS
listener "tcp" {
  address            = "0.0.0.0:8200"
  tls_cert_file      = "/vault/certs/server-cert.pem"
  tls_key_file       = "/vault/certs/server-key.pem"
  tls_client_ca_file = "/vault/certs/ca-cert.pem"
  tls_min_version    = "tls12"
  tls_require_and_verify_client_cert = false
}

# Dev listener (disable in production by removing this block)
# listener "tcp" {
#   address     = "0.0.0.0:8200"
#   tls_disable = 1
# }

api_addr = "https://0.0.0.0:8200"

ui = true

default_lease_ttl = "168h"
max_lease_ttl     = "720h"

telemetry {
  prometheus_retention_time = "24h"
  disable_hostname         = true
}
