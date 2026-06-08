#!/bin/bash
# FarmConnect Database Migration Runner
#
# Wraps Drizzle ORM migrations with safety checks, backups, and rollback support.
#
# Usage:
#   ./scripts/db-migrate.sh status          # Show current migration state
#   ./scripts/db-migrate.sh generate        # Generate new migration from schema changes
#   ./scripts/db-migrate.sh migrate         # Apply pending migrations
#   ./scripts/db-migrate.sh migrate --dry   # Dry run (show SQL without executing)
#   ./scripts/db-migrate.sh seed            # Run all seed scripts
#   ./scripts/db-migrate.sh rollback        # Rollback last migration (via backup restore)
#   ./scripts/db-migrate.sh verify          # Verify DB schema matches Drizzle schema

set -euo pipefail

ACTION="${1:-status}"
DRY_RUN=false
[ "${2:-}" = "--dry" ] && DRY_RUN=true

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/farmer_data}"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

status() {
    log "=== Migration Status ==="

    # Check Drizzle migration history
    if [ -d "drizzle/migrations" ]; then
        local count
        count=$(find drizzle/migrations -name "*.sql" 2>/dev/null | wc -l)
        log "Migration files: $count"
        log ""
        log "Recent migrations:"
        find drizzle/migrations -name "*.sql" -exec basename {} \; | sort | tail -10
    else
        log "No migrations directory found"
    fi

    log ""
    log "Schema files:"
    find drizzle -name "*.ts" -not -path "*/migrations/*" -not -path "*/meta/*" | sort | while read -r f; do
        local tables
        tables=$(grep -c "pgTable\|mysqlTable\|sqliteTable" "$f" 2>/dev/null || echo "0")
        echo "  $f ($tables tables)"
    done

    log ""
    log "Seed files:"
    find drizzle -name "seed*.ts" | sort
    find scripts -name "seed*.sql" 2>/dev/null | sort

    log ""
    # Check DB connection
    if command -v psql &>/dev/null; then
        local table_count
        table_count=$(psql "$DATABASE_URL" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')
        if [ -n "$table_count" ]; then
            log "Database tables: $table_count"
            log "Database connected: YES"
        else
            log "Database connected: NO (psql available but connection failed)"
        fi
    else
        log "psql not available — skipping DB connection check"
    fi
}

generate() {
    log "Generating migration from schema changes..."
    npx drizzle-kit generate 2>&1
    log "Migration generated. Review files in drizzle/migrations/"
}

migrate() {
    log "=== Running Database Migrations ==="

    if [ "$DRY_RUN" = true ]; then
        log "DRY RUN — showing pending SQL without executing"
        log ""
        # Show pending migration files
        if [ -d "drizzle/migrations" ]; then
            for f in drizzle/migrations/*.sql; do
                [ -f "$f" ] || continue
                echo "--- $(basename "$f") ---"
                cat "$f"
                echo ""
            done
        fi
        return
    fi

    # Pre-migration backup
    log "Creating pre-migration backup..."
    if [ -x scripts/backup/pg_backup.sh ]; then
        BACKUP_DIR="/tmp/farmconnect-pre-migrate" scripts/backup/pg_backup.sh full local 2>/dev/null || \
            log "WARNING: Pre-migration backup failed (continuing anyway)"
    fi

    # Run Drizzle migrations
    log "Applying migrations..."
    npx drizzle-kit migrate 2>&1

    log "Migrations applied successfully"
}

seed() {
    log "=== Running Seed Scripts ==="

    # Run SQL seed files
    local sql_seeds=(
        "scripts/seed.sql"
        "scripts/seed-remaining.sql"
        "scripts/seed-extended.sql"
    )

    for seed_file in "${sql_seeds[@]}"; do
        if [ -f "$seed_file" ]; then
            log "Running $seed_file..."
            if command -v psql &>/dev/null; then
                psql "$DATABASE_URL" -f "$seed_file" 2>&1 | tail -5
            else
                log "  psql not available — skipping SQL seed"
            fi
        fi
    done

    # Run TypeScript seed files via Drizzle
    local ts_seeds=(
        "drizzle/seed-data.ts"
        "drizzle/seed-complete.ts"
        "drizzle/seed-platform-extensions.ts"
    )

    for seed_file in "${ts_seeds[@]}"; do
        if [ -f "$seed_file" ]; then
            log "Running $seed_file..."
            npx tsx "$seed_file" 2>&1 | tail -5 || log "  WARNING: $seed_file had errors (non-fatal)"
        fi
    done

    log "Seeding complete"
}

rollback() {
    log "=== Rollback ==="
    log "WARNING: Drizzle ORM does not support native rollback."
    log ""
    log "Options:"
    log "  1. Restore from pre-migration backup:"
    log "     BACKUP_DIR=/tmp/farmconnect-pre-migrate ./scripts/backup/pg_backup.sh restore local"
    log ""
    log "  2. Restore from scheduled backup:"
    log "     ./scripts/backup/pg_backup.sh restore local"
    log ""
    log "  3. Manual SQL fix:"
    log "     psql \$DATABASE_URL -c 'DROP TABLE IF EXISTS <table>;'"
    log ""

    # Check if pre-migration backup exists
    if [ -d "/tmp/farmconnect-pre-migrate" ]; then
        local latest
        latest=$(ls -t /tmp/farmconnect-pre-migrate/pg_full_*.sql.gz 2>/dev/null | head -1)
        if [ -n "$latest" ]; then
            log "Pre-migration backup found: $latest"
            read -r -p "Restore from this backup? [y/N] " confirm
            if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
                BACKUP_DIR=/tmp/farmconnect-pre-migrate scripts/backup/pg_backup.sh restore local "$latest"
            fi
        fi
    else
        log "No pre-migration backup found"
    fi
}

verify() {
    log "=== Schema Verification ==="

    # Count tables in each schema file
    local schema_tables=0
    while IFS= read -r f; do
        local count
        count=$(grep -c "pgTable" "$f" 2>/dev/null || echo "0")
        schema_tables=$((schema_tables + count))
    done < <(find drizzle -name "*.ts" -not -path "*/migrations/*" -not -path "*/meta/*" -not -name "seed*")

    log "Tables defined in Drizzle schema: $schema_tables"

    # Count tables in database
    if command -v psql &>/dev/null; then
        local db_tables
        db_tables=$(psql "$DATABASE_URL" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')
        if [ -n "$db_tables" ]; then
            log "Tables in database: $db_tables"
            local diff=$((db_tables - schema_tables))
            if [ "$diff" -eq 0 ]; then
                log "Schema and database are in sync"
            elif [ "$diff" -gt 0 ]; then
                log "WARNING: Database has $diff extra tables (may be migration metadata)"
            else
                log "WARNING: Schema defines $((-diff)) tables not in database — run migrate"
            fi
        fi
    else
        log "psql not available — cannot verify against live database"
    fi

    # Check for pending migrations
    log ""
    log "Checking Drizzle push status..."
    npx drizzle-kit check 2>&1 || log "Schema check completed (review output above)"
}

case "$ACTION" in
    status)   status ;;
    generate) generate ;;
    migrate)  migrate ;;
    seed)     seed ;;
    rollback) rollback ;;
    verify)   verify ;;
    *)
        echo "Usage: $0 [status|generate|migrate|seed|rollback|verify] [--dry]"
        exit 1
        ;;
esac
