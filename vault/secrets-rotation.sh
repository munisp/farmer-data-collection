#!/bin/bash
# FarmConnect Secrets Rotation Policy
# Rotates JWT, API keys, and database credentials on schedule
# Usage: ./vault/secrets-rotation.sh [--rotate-jwt] [--rotate-db] [--rotate-all] [--dry-run]
set -euo pipefail

VAULT_ADDR="${VAULT_ADDR:-https://localhost:8200}"
VAULT_TOKEN="${VAULT_TOKEN:-}"
DRY_RUN=false

log() { echo "[$(date -Iseconds)] $*"; }
error() { log "ERROR: $*" >&2; }

rotate_jwt_secret() {
  local new_secret
  new_secret=$(openssl rand -base64 48)

  if [ "$DRY_RUN" = true ]; then
    log "[DRY RUN] Would rotate JWT secret"
    return
  fi

  log "Rotating JWT secret..."
  vault kv put farmconnect/jwt \
    secret="$new_secret" \
    issuer="farmconnect" \
    audience="farmconnect-api" \
    expiry="24h" \
    rotated_at="$(date -Iseconds)" \
    rotation_id="$(openssl rand -hex 8)"

  log "JWT secret rotated. Services must be restarted to pick up new secret."
  log "NOTE: Existing tokens signed with old secret will be invalid."
}

rotate_db_password() {
  local new_password
  new_password=$(openssl rand -base64 32 | tr -d '=/+' | head -c 32)

  if [ "$DRY_RUN" = true ]; then
    log "[DRY RUN] Would rotate database password"
    return
  fi

  log "Rotating database password..."

  # Update password in PostgreSQL
  PGPASSWORD="${DB_CURRENT_PASSWORD:-postgres}" psql \
    -h "${DB_HOST:-localhost}" -p "${DB_PORT:-5432}" -U "${DB_USER:-postgres}" -d postgres \
    -c "ALTER USER ${DB_USER:-postgres} PASSWORD '${new_password}';"

  # Update in Vault
  vault kv put farmconnect/database \
    url="postgresql://${DB_USER:-postgres}:${new_password}@${DB_HOST:-postgres}:${DB_PORT:-5432}/${DB_NAME:-farmer_data}" \
    pool_max=20 \
    pool_idle_timeout=30000 \
    statement_timeout=30000 \
    rotated_at="$(date -Iseconds)"

  log "Database password rotated. Update DATABASE_URL in running services."
}

rotate_api_keys() {
  if [ "$DRY_RUN" = true ]; then
    log "[DRY RUN] Would mark external API keys for rotation"
    return
  fi

  log "External API key rotation requires manual steps:"
  log "  1. Africa's Talking: https://account.africastalking.com/apps/sandbox/settings"
  log "  2. OpenWeather: https://home.openweathermap.org/api_keys"
  log "  3. Flutterwave: https://dashboard.flutterwave.com/settings/apis"
  log "  4. Paystack: https://dashboard.paystack.com/#/settings/developer"
  log ""
  log "After rotating external keys, update Vault:"
  log "  vault kv put farmconnect/external/africas-talking api_key=<new_key> ..."
  log "  vault kv put farmconnect/external/openweather api_key=<new_key>"
  log "  vault kv put farmconnect/payments/flutterwave secret_key=<new_key> ..."
  log "  vault kv put farmconnect/payments/paystack secret_key=<new_key>"
}

check_rotation_status() {
  log "=== Secret Rotation Status ==="

  for path in farmconnect/jwt farmconnect/database farmconnect/keycloak; do
    local metadata
    metadata=$(vault kv metadata get -format=json "$path" 2>/dev/null || echo '{}')
    local version
    version=$(echo "$metadata" | jq -r '.data.current_version // "unknown"')
    local updated
    updated=$(echo "$metadata" | jq -r '.data.updated_time // "never"')
    log "  $path: version=$version, last_updated=$updated"
  done

  log ""
  log "=== Rotation Policy ==="
  log "  JWT Secret:     Rotate every 90 days"
  log "  DB Password:    Rotate every 90 days"
  log "  Keycloak:       Rotate every 180 days"
  log "  External APIs:  Rotate every 365 days"
  log "  Payment Keys:   Rotate every 90 days"
}

# Parse arguments
case "${1:-}" in
  --rotate-jwt)
    rotate_jwt_secret
    ;;
  --rotate-db)
    rotate_db_password
    ;;
  --rotate-api)
    rotate_api_keys
    ;;
  --rotate-all)
    rotate_jwt_secret
    rotate_db_password
    rotate_api_keys
    ;;
  --status)
    check_rotation_status
    ;;
  --dry-run)
    DRY_RUN=true
    rotate_jwt_secret
    rotate_db_password
    rotate_api_keys
    ;;
  *)
    echo "Usage: $0 [--rotate-jwt|--rotate-db|--rotate-api|--rotate-all|--status|--dry-run]"
    echo ""
    echo "Rotation Schedule (crontab):"
    echo "  # JWT: Every 90 days"
    echo "  0 2 1 */3 * /opt/farmconnect/vault/secrets-rotation.sh --rotate-jwt"
    echo "  # DB: Every 90 days (offset by 1 week)"
    echo "  0 2 8 */3 * /opt/farmconnect/vault/secrets-rotation.sh --rotate-db"
    echo "  # Status check: Weekly"
    echo "  0 9 * * 1 /opt/farmconnect/vault/secrets-rotation.sh --status"
    check_rotation_status
    ;;
esac
