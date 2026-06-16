#!/bin/bash
# FarmConnect Database Backup Script
# Usage: ./scripts/db-backup.sh [--restore <backup_file>] [--verify] [--list]
set -euo pipefail

# Configuration (override via environment variables)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-farmer_data}"
DB_USER="${DB_USER:-postgres}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/farmconnect}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
S3_BUCKET="${BACKUP_S3_BUCKET:-}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

log() { echo "[$(date -Iseconds)] $*"; }
error() { log "ERROR: $*" >&2; }

check_deps() {
  for cmd in pg_dump pg_restore psql gzip; do
    command -v "$cmd" >/dev/null 2>&1 || { error "$cmd is required but not installed"; exit 1; }
  done
}

create_backup() {
  log "Starting backup of ${DB_NAME}@${DB_HOST}:${DB_PORT}"
  mkdir -p "$BACKUP_DIR"

  # Full database dump with compression
  PGPASSWORD="${PGPASSWORD:-${DB_PASSWORD:-postgres}}" pg_dump \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --format=custom --compress=9 \
    --no-owner --no-privileges \
    --verbose 2>"${BACKUP_FILE%.sql.gz}.log" \
    | gzip > "$BACKUP_FILE"

  local size
  size=$(du -sh "$BACKUP_FILE" | cut -f1)
  log "Backup complete: $BACKUP_FILE ($size)"

  # Generate checksum
  sha256sum "$BACKUP_FILE" > "${BACKUP_FILE}.sha256"
  log "Checksum: $(cat "${BACKUP_FILE}.sha256")"

  # Upload to S3 if configured
  if [ -n "$S3_BUCKET" ]; then
    upload_to_s3
  fi

  # Cleanup old backups
  cleanup_old_backups
}

upload_to_s3() {
  if command -v aws >/dev/null 2>&1; then
    log "Uploading to S3: s3://${S3_BUCKET}/backups/"
    aws s3 cp "$BACKUP_FILE" "s3://${S3_BUCKET}/backups/" --storage-class STANDARD_IA
    aws s3 cp "${BACKUP_FILE}.sha256" "s3://${S3_BUCKET}/backups/"
    log "S3 upload complete"
  else
    error "AWS CLI not installed — skipping S3 upload"
  fi
}

cleanup_old_backups() {
  log "Cleaning up backups older than ${RETENTION_DAYS} days"
  local count
  count=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +"$RETENTION_DAYS" | wc -l)
  if [ "$count" -gt 0 ]; then
    find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
    find "$BACKUP_DIR" -name "${DB_NAME}_*.sha256" -mtime +"$RETENTION_DAYS" -delete
    find "$BACKUP_DIR" -name "${DB_NAME}_*.log" -mtime +"$RETENTION_DAYS" -delete
    log "Removed $count old backup(s)"
  else
    log "No old backups to remove"
  fi
}

restore_backup() {
  local restore_file="$1"
  if [ ! -f "$restore_file" ]; then
    error "Backup file not found: $restore_file"
    exit 1
  fi

  # Verify checksum if available
  if [ -f "${restore_file}.sha256" ]; then
    log "Verifying checksum..."
    sha256sum -c "${restore_file}.sha256" || { error "Checksum verification failed"; exit 1; }
  fi

  log "Restoring from: $restore_file"
  log "WARNING: This will overwrite the current database ${DB_NAME}"
  read -p "Continue? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log "Restore cancelled"
    exit 0
  fi

  # Drop and recreate database
  PGPASSWORD="${PGPASSWORD:-${DB_PASSWORD:-postgres}}" psql \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}' AND pid <> pg_backend_pid();" \
    -c "DROP DATABASE IF EXISTS ${DB_NAME};" \
    -c "CREATE DATABASE ${DB_NAME};"

  # Restore
  gunzip -c "$restore_file" | PGPASSWORD="${PGPASSWORD:-${DB_PASSWORD:-postgres}}" pg_restore \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --no-owner --no-privileges --verbose 2>"${restore_file%.sql.gz}_restore.log" || true

  log "Restore complete. Check ${restore_file%.sql.gz}_restore.log for details."

  # Verify table counts
  verify_restore
}

verify_restore() {
  log "Verifying restore..."
  local table_count
  table_count=$(PGPASSWORD="${PGPASSWORD:-${DB_PASSWORD:-postgres}}" psql \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" | tr -d ' ')
  log "Tables restored: $table_count"

  if [ "$table_count" -lt 10 ]; then
    error "WARNING: Low table count ($table_count) — restore may be incomplete"
    exit 1
  fi
  log "Restore verification passed"
}

list_backups() {
  log "Available backups in $BACKUP_DIR:"
  if [ -d "$BACKUP_DIR" ]; then
    ls -lhS "$BACKUP_DIR"/${DB_NAME}_*.sql.gz 2>/dev/null || echo "  No backups found"
  else
    echo "  Backup directory does not exist"
  fi
}

verify_backup() {
  local latest
  latest=$(ls -t "$BACKUP_DIR"/${DB_NAME}_*.sql.gz 2>/dev/null | head -1)
  if [ -z "$latest" ]; then
    error "No backups found in $BACKUP_DIR"
    exit 1
  fi

  log "Verifying latest backup: $latest"

  # Check checksum
  if [ -f "${latest}.sha256" ]; then
    sha256sum -c "${latest}.sha256" && log "Checksum: OK" || { error "Checksum FAILED"; exit 1; }
  fi

  # Test decompression
  gunzip -t "$latest" && log "Compression: OK" || { error "Compression FAILED"; exit 1; }

  # Test restore to temporary database
  local test_db="${DB_NAME}_verify_$(date +%s)"
  log "Test restore to $test_db..."
  PGPASSWORD="${PGPASSWORD:-${DB_PASSWORD:-postgres}}" psql \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
    -c "CREATE DATABASE $test_db;"

  gunzip -c "$latest" | PGPASSWORD="${PGPASSWORD:-${DB_PASSWORD:-postgres}}" pg_restore \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$test_db" \
    --no-owner --no-privileges 2>/dev/null || true

  local table_count
  table_count=$(PGPASSWORD="${PGPASSWORD:-${DB_PASSWORD:-postgres}}" psql \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$test_db" \
    -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" | tr -d ' ')

  # Cleanup
  PGPASSWORD="${PGPASSWORD:-${DB_PASSWORD:-postgres}}" psql \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
    -c "DROP DATABASE $test_db;"

  log "Test restore: $table_count tables recovered"
  if [ "$table_count" -lt 10 ]; then
    error "Verification FAILED — low table count"
    exit 1
  fi
  log "Backup verification PASSED"
}

# Main
check_deps
case "${1:-}" in
  --restore)
    shift
    restore_backup "$1"
    ;;
  --verify)
    verify_backup
    ;;
  --list)
    list_backups
    ;;
  *)
    create_backup
    ;;
esac
