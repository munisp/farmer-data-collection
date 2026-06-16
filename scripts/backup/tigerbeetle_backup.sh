#!/bin/bash
# TigerBeetle Backup & Restore Script
# Usage: ./tigerbeetle_backup.sh [backup|restore|verify] [local|s3]
#
# TigerBeetle stores data in a single data file. This script backs up
# that file along with metadata about the cluster state.
#
# Cron examples:
#   0 3 * * * /path/to/tigerbeetle_backup.sh backup s3    # Daily 3am → S3
#   0 */12 * * * /path/to/tigerbeetle_backup.sh backup local  # Every 12h → local

set -euo pipefail

ACTION="${1:-backup}"
TARGET="${2:-local}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${TB_BACKUP_DIR:-/home/ubuntu/backups/tigerbeetle}"
TB_DATA_FILE="${TB_DATA_FILE:-/var/lib/tigerbeetle/0_0.tigerbeetle}"
TB_ADDRESS="${TB_ADDRESS:-localhost:3000}"
TB_CLUSTER_ID="${TB_CLUSTER_ID:-0}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
S3_BUCKET="${S3_BUCKET:-farmconnect-backups}"
S3_PREFIX="tigerbeetle"

mkdir -p "$BACKUP_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

backup() {
    log "Starting TigerBeetle backup..."

    if [ ! -f "$TB_DATA_FILE" ]; then
        log "ERROR: TigerBeetle data file not found at $TB_DATA_FILE"
        log "Set TB_DATA_FILE env var to the correct path"
        exit 1
    fi

    local data_size
    data_size=$(du -h "$TB_DATA_FILE" | cut -f1)
    log "Data file: $TB_DATA_FILE ($data_size)"

    # Create a consistent snapshot by copying the data file
    # TigerBeetle uses a deterministic storage engine that supports
    # file-level snapshots when the replica is quiescent
    local backup_file="${BACKUP_DIR}/tigerbeetle_${TIMESTAMP}.data"
    
    log "Copying data file..."
    cp "$TB_DATA_FILE" "$backup_file"

    # Compress the backup
    log "Compressing..."
    gzip "$backup_file"
    backup_file="${backup_file}.gz"

    local compressed_size
    compressed_size=$(du -h "$backup_file" | cut -f1)
    log "Compressed: $compressed_size"

    # Collect metadata
    local checksum
    checksum=$(sha256sum "$backup_file" | cut -d' ' -f1)

    cat > "${BACKUP_DIR}/tigerbeetle_${TIMESTAMP}.meta" <<EOF
timestamp=$TIMESTAMP
file=$backup_file
original_size=$data_size
compressed_size=$compressed_size
sha256=$checksum
cluster_id=$TB_CLUSTER_ID
tb_address=$TB_ADDRESS
source_file=$TB_DATA_FILE
hostname=$(hostname)
EOF

    log "Metadata saved"

    # Upload to S3 if requested
    if [ "$TARGET" = "s3" ]; then
        log "Uploading to S3..."
        aws s3 cp "$backup_file" "s3://${S3_BUCKET}/${S3_PREFIX}/tigerbeetle_${TIMESTAMP}.data.gz" \
            --metadata "cluster=${TB_CLUSTER_ID},checksum=${checksum}"
        aws s3 cp "${BACKUP_DIR}/tigerbeetle_${TIMESTAMP}.meta" \
            "s3://${S3_BUCKET}/${S3_PREFIX}/tigerbeetle_${TIMESTAMP}.meta"
        log "S3 upload complete"
    fi

    # Cleanup old backups
    find "$BACKUP_DIR" -name "tigerbeetle_*.data.gz" -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true
    find "$BACKUP_DIR" -name "tigerbeetle_*.meta" -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true

    log "TigerBeetle backup complete: $backup_file"
}

restore() {
    local restore_file="${3:-}"

    if [ -z "$restore_file" ]; then
        # Find latest backup
        restore_file=$(ls -t "${BACKUP_DIR}"/tigerbeetle_*.data.gz 2>/dev/null | head -1)
        if [ -z "$restore_file" ]; then
            log "ERROR: No backup files found in $BACKUP_DIR"
            exit 1
        fi
    fi

    log "Restoring from: $restore_file"

    # Verify checksum if meta file exists
    local meta_file="${restore_file%.data.gz}.meta"
    if [ -f "$meta_file" ]; then
        local expected_checksum
        expected_checksum=$(grep "sha256=" "$meta_file" | cut -d= -f2)
        local actual_checksum
        actual_checksum=$(sha256sum "$restore_file" | cut -d' ' -f1)

        if [ "$expected_checksum" != "$actual_checksum" ]; then
            log "ERROR: Checksum mismatch!"
            log "  Expected: $expected_checksum"
            log "  Actual:   $actual_checksum"
            exit 1
        fi
        log "Checksum verified"
    fi

    # Stop TigerBeetle before restore
    log "WARNING: TigerBeetle must be stopped before restore"
    log "Attempting to stop TigerBeetle..."
    
    if systemctl is-active --quiet tigerbeetle 2>/dev/null; then
        sudo systemctl stop tigerbeetle
        log "TigerBeetle stopped via systemd"
    elif pgrep -x tigerbeetle > /dev/null; then
        pkill tigerbeetle || true
        sleep 3
        log "TigerBeetle process stopped"
    else
        log "TigerBeetle does not appear to be running"
    fi

    # Backup current data file
    if [ -f "$TB_DATA_FILE" ]; then
        local pre_restore_backup="${TB_DATA_FILE}.pre-restore.$(date +%s)"
        cp "$TB_DATA_FILE" "$pre_restore_backup"
        log "Current data backed up to: $pre_restore_backup"
    fi

    # Decompress and restore
    log "Decompressing and restoring..."
    gunzip -c "$restore_file" > "$TB_DATA_FILE"

    local restored_size
    restored_size=$(du -h "$TB_DATA_FILE" | cut -f1)
    log "Restored data file: $restored_size"

    # Start TigerBeetle
    log "Starting TigerBeetle..."
    if systemctl list-unit-files tigerbeetle.service &>/dev/null; then
        sudo systemctl start tigerbeetle
        log "TigerBeetle started via systemd"
    else
        log "NOTE: Start TigerBeetle manually: tigerbeetle start --addresses=$TB_ADDRESS $TB_DATA_FILE"
    fi

    log "TigerBeetle restore complete"
}

verify() {
    log "=== TigerBeetle Backup Verification ==="

    local latest
    latest=$(ls -t "${BACKUP_DIR}"/tigerbeetle_*.data.gz 2>/dev/null | head -1)

    if [ -z "$latest" ]; then
        log "ERROR: No backups found in $BACKUP_DIR"
        exit 1
    fi

    log "Latest backup: $latest"

    local size
    size=$(du -h "$latest" | cut -f1)
    log "Compressed size: $size"

    # Verify file integrity (can decompress)
    log "Testing decompression..."
    if gunzip -t "$latest" 2>/dev/null; then
        log "Compression integrity: PASSED"
    else
        log "ERROR: File is corrupted"
        exit 1
    fi

    # Verify checksum
    local meta_file="${latest%.data.gz}.meta"
    if [ -f "$meta_file" ]; then
        local expected
        expected=$(grep "sha256=" "$meta_file" | cut -d= -f2)
        local actual
        actual=$(sha256sum "$latest" | cut -d' ' -f1)

        if [ "$expected" = "$actual" ]; then
            log "Checksum verification: PASSED"
        else
            log "ERROR: Checksum mismatch"
            exit 1
        fi

        log "Cluster ID: $(grep 'cluster_id=' "$meta_file" | cut -d= -f2)"
        log "Source: $(grep 'hostname=' "$meta_file" | cut -d= -f2)"
    else
        log "WARNING: No metadata file found"
    fi

    # Check backup age
    local age_hours
    age_hours=$(( ($(date +%s) - $(stat -c %Y "$latest" 2>/dev/null || stat -f %m "$latest" 2>/dev/null)) / 3600 ))
    log "Backup age: ${age_hours} hours"

    if [ "$age_hours" -gt 48 ]; then
        log "WARNING: Backup is older than 48 hours"
    fi

    local count
    count=$(ls "${BACKUP_DIR}"/tigerbeetle_*.data.gz 2>/dev/null | wc -l)
    log "Total backups: $count"

    log "=== Verification complete ==="
}

case "$ACTION" in
    backup)  backup ;;
    restore) restore "$@" ;;
    verify)  verify ;;
    *)
        echo "Usage: $0 [backup|restore|verify] [local|s3]"
        exit 1
        ;;
esac
