#!/bin/bash
# Automated secrets rotation scheduler
# Installs cron jobs for periodic secret rotation
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROTATION_SCRIPT="${SCRIPT_DIR}/../vault/secrets-rotation.sh"
LOG_DIR="/var/log/farmconnect"

mkdir -p "$LOG_DIR" 2>/dev/null || true

echo "=== FarmConnect Secrets Rotation Scheduler ==="

# Define rotation schedules
declare -A ROTATION_SCHEDULES
ROTATION_SCHEDULES[jwt]="0 2 * * 0"          # JWT keys: weekly (Sunday 2 AM)
ROTATION_SCHEDULES[database]="0 3 1 * *"      # DB passwords: monthly (1st of month, 3 AM)
ROTATION_SCHEDULES[api_keys]="0 4 1 */3 *"    # API keys: quarterly
ROTATION_SCHEDULES[session]="0 1 * * *"       # Session secrets: daily (1 AM)

install_cron() {
  local secret_type="$1"
  local schedule="$2"
  local cron_entry="$schedule $ROTATION_SCRIPT --type=$secret_type >> $LOG_DIR/secrets-rotation.log 2>&1"

  # Remove existing entry for this type
  crontab -l 2>/dev/null | grep -v "secrets-rotation.sh --type=$secret_type" | crontab - 2>/dev/null || true

  # Add new entry
  (crontab -l 2>/dev/null; echo "$cron_entry") | crontab -
  echo "  ✓ $secret_type: $schedule"
}

echo ""
echo "Installing rotation schedules:"
for secret_type in "${!ROTATION_SCHEDULES[@]}"; do
  install_cron "$secret_type" "${ROTATION_SCHEDULES[$secret_type]}"
done

echo ""
echo "Installed cron jobs:"
crontab -l 2>/dev/null | grep "secrets-rotation" || echo "  (none - crontab not available in this environment)"

echo ""
echo "Rotation log: $LOG_DIR/secrets-rotation.log"
echo ""
echo "Manual rotation: $ROTATION_SCRIPT --type=jwt"
echo "All types:       $ROTATION_SCRIPT --type=all"
