storage "file" {
  path = "/vault/data"
}

# Production TLS listener
listener "tcp" {
  address       = "0.0.0.0:8200"
  tls_cert_file = "/vault/tls/vault.crt"
  tls_key_file  = "/vault/tls/vault.key"
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
