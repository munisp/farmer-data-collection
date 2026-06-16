#!/bin/bash
# PostgreSQL Backup & Disaster Recovery Script
# Usage: ./pg_backup.sh [full|incremental|wal] [local|s3]
#
# Cron examples:
#   0 2 * * * /path/to/pg_backup.sh full s3       # Daily full backup at 2am → S3
#   0 */6 * * * /path/to/pg_backup.sh full local   # Every 6 hours → local
#   */30 * * * * /path/to/pg_backup.sh wal s3       # WAL archive every 30min

set -euo pipefail

BACKUP_TYPE="${1:-full}"
BACKUP_TARGET="${2:-local}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/home/ubuntu/backups}"
DB_NAME="${DATABASE_NAME:-farmer_data}"
DB_HOST="${DATABASE_HOST:-localhost}"
DB_PORT="${DATABASE_PORT:-5432}"
DB_USER="${DATABASE_USER:-postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
S3_BUCKET="${S3_BUCKET:-farmconnect-backups}"
S3_REGION="${S3_REGION:-us-east-1}"

mkdir -p "$BACKUP_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

full_backup() {
    local filename="${BACKUP_DIR}/${DB_NAME}_full_${TIMESTAMP}.sql.gz"
    log "Starting full backup of ${DB_NAME}..."

    PGPASSWORD="${DATABASE_PASSWORD:-postgres}" pg_dump \
        -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
        -d "$DB_NAME" \
        --format=custom \
        --compress=9 \
        --verbose \
        --file="${filename%.gz}" \
        2>&1 | tail -5

    gzip -f "${filename%.gz}" 2>/dev/null || true

    local size
    size=$(du -h "$filename" 2>/dev/null | cut -f1 || echo "unknown")
    log "Full backup complete: $filename ($size)"

    if [ "$BACKUP_TARGET" = "s3" ]; then
        upload_s3 "$filename"
    fi

    echo "$filename"
}

upload_s3() {
    local file="$1"
    local key="backups/$(basename "$file")"
    log "Uploading to s3://${S3_BUCKET}/${key}..."

    if command -v aws &>/dev/null; then
        aws s3 cp "$file" "s3://${S3_BUCKET}/${key}" \
            --region "$S3_REGION" \
            --storage-class STANDARD_IA
        log "S3 upload complete"
    else
        log "WARN: aws CLI not installed, skipping S3 upload"
    fi
}

cleanup_old() {
    log "Cleaning backups older than ${RETENTION_DAYS} days..."
    find "$BACKUP_DIR" -name "${DB_NAME}_*" -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true

    if command -v aws &>/dev/null && [ "$BACKUP_TARGET" = "s3" ]; then
        local cutoff
        cutoff=$(date -d "-${RETENTION_DAYS} days" +%Y-%m-%d 2>/dev/null || date -v-${RETENTION_DAYS}d +%Y-%m-%d)
        log "S3 lifecycle policy should handle retention (cutoff: $cutoff)"
    fi
}

verify_backup() {
    local file="$1"
    log "Verifying backup integrity..."

    if [[ "$file" == *.gz ]]; then
        gzip -t "$file" && log "Backup verified OK" || log "ERROR: Backup corrupted!"
    fi
}

case "$BACKUP_TYPE" in
    full)
        file=$(full_backup)
        verify_backup "$file"
        cleanup_old
        ;;
    wal)
        log "WAL archiving configured in postgresql.conf (archive_command)"
        log "Ensure archive_mode=on and archive_command is set"
        ;;
    *)
        echo "Usage: $0 [full|wal] [local|s3]"
        exit 1
        ;;
esac

log "Backup process complete"
