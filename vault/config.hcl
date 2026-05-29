storage "file" {
  path = "/vault/data"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 1
}

api_addr = "http://0.0.0.0:8200"

ui = true

default_lease_ttl = "168h"
max_lease_ttl     = "720h"

telemetry {
  prometheus_retention_time = "24h"
  disable_hostname         = true
}
