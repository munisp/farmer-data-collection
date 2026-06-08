#!/bin/bash
# Redis Backup & Restore Script
# Usage: ./redis_backup.sh [backup|restore|verify] [local|s3]
#
# Cron examples:
#   0 */4 * * * /path/to/redis_backup.sh backup local    # Every 4 hours → local
#   0 2 * * *   /path/to/redis_backup.sh backup s3       # Daily 2am → S3

set -euo pipefail

ACTION="${1:-backup}"
TARGET="${2:-local}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${REDIS_BACKUP_DIR:-/home/ubuntu/backups/redis}"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
S3_BUCKET="${S3_BUCKET:-farmconnect-backups}"
S3_PREFIX="redis"

mkdir -p "$BACKUP_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

redis_cmd() {
    if [ -n "$REDIS_PASSWORD" ]; then
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" --no-auth-warning "$@"
    else
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" "$@"
    fi
}

backup() {
    log "Starting Redis backup..."

    # Trigger RDB snapshot
    log "Triggering BGSAVE..."
    redis_cmd BGSAVE

    # Wait for background save to complete
    local max_wait=120
    local waited=0
    while [ "$waited" -lt "$max_wait" ]; do
        local last_save
        last_save=$(redis_cmd LASTSAVE)
        local bg_status
        bg_status=$(redis_cmd INFO persistence | grep rdb_bgsave_in_progress | tr -d '\r' | cut -d: -f2)

        if [ "$bg_status" = "0" ]; then
            log "BGSAVE completed"
            break
        fi

        sleep 2
        waited=$((waited + 2))
    done

    if [ "$waited" -ge "$max_wait" ]; then
        log "WARNING: BGSAVE did not complete within ${max_wait}s"
    fi

    # Find and copy RDB file
    local rdb_dir
    rdb_dir=$(redis_cmd CONFIG GET dir | tail -1 | tr -d '\r')
    local rdb_file
    rdb_file=$(redis_cmd CONFIG GET dbfilename | tail -1 | tr -d '\r')
    local rdb_path="${rdb_dir}/${rdb_file}"

    if [ ! -f "$rdb_path" ]; then
        log "ERROR: RDB file not found at $rdb_path"
        exit 1
    fi

    local backup_file="${BACKUP_DIR}/redis_${TIMESTAMP}.rdb"
    cp "$rdb_path" "$backup_file"

    # Also dump AOF if enabled
    local aof_enabled
    aof_enabled=$(redis_cmd CONFIG GET appendonly | tail -1 | tr -d '\r')
    if [ "$aof_enabled" = "yes" ]; then
        local aof_file
        aof_file=$(redis_cmd CONFIG GET appendfilename | tail -1 | tr -d '\r')
        local aof_path="${rdb_dir}/${aof_file}"
        if [ -f "$aof_path" ]; then
            cp "$aof_path" "${BACKUP_DIR}/redis_${TIMESTAMP}.aof"
            log "AOF file backed up"
        fi
    fi

    # Compress
    gzip "$backup_file"
    backup_file="${backup_file}.gz"

    local size
    size=$(du -h "$backup_file" | cut -f1)
    log "Backup saved: $backup_file ($size)"

    # Collect metadata
    local db_size
    db_size=$(redis_cmd DBSIZE | tr -d '\r')
    local memory
    memory=$(redis_cmd INFO memory | grep used_memory_human | tr -d '\r' | cut -d: -f2)

    cat > "${BACKUP_DIR}/redis_${TIMESTAMP}.meta" <<EOF
timestamp=$TIMESTAMP
file=$backup_file
size=$size
db_size=$db_size
memory=$memory
redis_version=$(redis_cmd INFO server | grep redis_version | tr -d '\r' | cut -d: -f2)
EOF

    # Upload to S3 if requested
    if [ "$TARGET" = "s3" ]; then
        log "Uploading to S3..."
        aws s3 cp "$backup_file" "s3://${S3_BUCKET}/${S3_PREFIX}/redis_${TIMESTAMP}.rdb.gz"
        aws s3 cp "${BACKUP_DIR}/redis_${TIMESTAMP}.meta" "s3://${S3_BUCKET}/${S3_PREFIX}/redis_${TIMESTAMP}.meta"
        log "S3 upload complete"
    fi

    # Cleanup old backups
    find "$BACKUP_DIR" -name "redis_*.rdb.gz" -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true
    find "$BACKUP_DIR" -name "redis_*.aof" -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true
    find "$BACKUP_DIR" -name "redis_*.meta" -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true

    log "Redis backup complete"
}

restore() {
    local restore_file="${3:-}"

    if [ -z "$restore_file" ]; then
        # Find latest backup
        restore_file=$(ls -t "${BACKUP_DIR}"/redis_*.rdb.gz 2>/dev/null | head -1)
        if [ -z "$restore_file" ]; then
            log "ERROR: No backup files found in $BACKUP_DIR"
            exit 1
        fi
    fi

    log "Restoring from: $restore_file"

    # Decompress if needed
    local rdb_file="$restore_file"
    if [[ "$restore_file" == *.gz ]]; then
        rdb_file="${restore_file%.gz}"
        gunzip -k "$restore_file"
    fi

    # Get Redis data directory
    local rdb_dir
    rdb_dir=$(redis_cmd CONFIG GET dir | tail -1 | tr -d '\r')
    local rdb_filename
    rdb_filename=$(redis_cmd CONFIG GET dbfilename | tail -1 | tr -d '\r')

    # Shutdown Redis, replace RDB, restart
    log "Stopping Redis..."
    redis_cmd SHUTDOWN NOSAVE || true
    sleep 2

    cp "$rdb_file" "${rdb_dir}/${rdb_filename}"

    log "Starting Redis with restored data..."
    redis-server --daemonize yes

    sleep 2
    local db_size
    db_size=$(redis_cmd DBSIZE | tr -d '\r')
    log "Restore complete: $db_size"

    # Cleanup decompressed file
    if [[ "$restore_file" == *.gz ]] && [ -f "$rdb_file" ]; then
        rm "$rdb_file"
    fi
}

verify() {
    log "=== Redis Backup Verification ==="

    local latest
    latest=$(ls -t "${BACKUP_DIR}"/redis_*.rdb.gz 2>/dev/null | head -1)

    if [ -z "$latest" ]; then
        log "ERROR: No backups found"
        exit 1
    fi

    log "Latest backup: $latest"
    local size
    size=$(du -h "$latest" | cut -f1)
    log "Size: $size"

    # Verify RDB integrity
    local temp_rdb="/tmp/redis_verify_$$.rdb"
    gunzip -c "$latest" > "$temp_rdb"

    if redis-check-rdb "$temp_rdb" 2>/dev/null; then
        log "RDB integrity check: PASSED"
    else
        log "WARNING: redis-check-rdb not available, checking file header"
        local header
        header=$(head -c 5 "$temp_rdb")
        if [ "$header" = "REDIS" ]; then
            log "RDB header check: PASSED"
        else
            log "ERROR: Invalid RDB file"
            rm "$temp_rdb"
            exit 1
        fi
    fi

    rm "$temp_rdb"

    # Check backup age
    local age_hours
    age_hours=$(( ($(date +%s) - $(stat -c %Y "$latest" 2>/dev/null || stat -f %m "$latest" 2>/dev/null)) / 3600 ))
    log "Backup age: ${age_hours} hours"

    if [ "$age_hours" -gt 24 ]; then
        log "WARNING: Backup is older than 24 hours"
    fi

    local count
    count=$(ls "${BACKUP_DIR}"/redis_*.rdb.gz 2>/dev/null | wc -l)
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
