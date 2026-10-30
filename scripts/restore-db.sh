#!/usr/bin/env bash
# GBC LIMS restore. DESTRUCTIVE when run against the live stack.
#
# Usage (from /opt/lims):
#   ./scripts/restore-db.sh <backup-stamp> [--target test|live]
#   e.g. ./scripts/restore-db.sh 2026-10-30T030001Z --target test
#
# --target test (default): restores into a throwaway Postgres container + volume
#   so you can verify the backup without touching production. Do this monthly.
# --target live: stops the API, replaces the live database and attachments.

set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source ./.env; set +a

STAMP="${1:?usage: restore-db.sh <backup-stamp> [--target test|live]}"
TARGET="test"; [ "${2:-}" = "--target" ] && TARGET="${3:-test}"
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET must be set in .env}"
PGUSER_="${POSTGRES_USER:-lims}"; PGDB_="${POSTGRES_DB:-lims}"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

PREFIX="daily"; aws s3 ls "s3://$BACKUP_S3_BUCKET/daily/$STAMP/" >/dev/null 2>&1 || PREFIX="monthly"
echo "Downloading s3://$BACKUP_S3_BUCKET/$PREFIX/$STAMP ..."
aws s3 cp --recursive "s3://$BACKUP_S3_BUCKET/$PREFIX/$STAMP/" "$WORK/" --only-show-errors
( cd "$WORK" && sha256sum -c SHA256SUMS )

if [ "$TARGET" = "test" ]; then
  C=lims-restore-test; V=lims-restore-test-files
  docker rm -f "$C" >/dev/null 2>&1 || true; docker volume rm "$V" >/dev/null 2>&1 || true
  docker run -d --name "$C" -e POSTGRES_USER="$PGUSER_" -e POSTGRES_PASSWORD=restoretest -e POSTGRES_DB="$PGDB_" postgres:16-alpine >/dev/null
  until docker exec "$C" pg_isready -U "$PGUSER_" -d "$PGDB_" >/dev/null 2>&1; do sleep 1; done
  docker exec -i "$C" pg_restore -U "$PGUSER_" -d "$PGDB_" --no-owner < "$WORK/db.dump"
  docker volume create "$V" >/dev/null
  docker run --rm -v "$V":/data -v "$WORK":/in:ro alpine tar -xzf /in/attachments.tar.gz -C /data
  echo "--- Restored row counts ---"
  for t in '"Samples"' '"Results"' '"Coas"' '"AuditLogs"' '"AspNetUsers"'; do
    printf '%-14s ' "$t"; docker exec "$C" psql -U "$PGUSER_" -d "$PGDB_" -tAc "SELECT count(*) FROM $t" || echo "?"
  done
  printf 'Attachment files: '; docker run --rm -v "$V":/data:ro alpine sh -c 'find /data -type f | wc -l'
  echo "Compare these against production, then clean up:"
  echo "  docker rm -f $C && docker volume rm $V"
  exit 0
fi

read -r -p "This REPLACES the live LIMS database and files with $STAMP. Type RESTORE to continue: " ok
[ "$ok" = "RESTORE" ] || { echo "Aborted."; exit 1; }
docker compose stop api frontend
docker exec lims-postgres-1 psql -U "$PGUSER_" -d postgres -c "DROP DATABASE IF EXISTS \"$PGDB_\" WITH (FORCE);" -c "CREATE DATABASE \"$PGDB_\";"
docker exec -i lims-postgres-1 pg_restore -U "$PGUSER_" -d "$PGDB_" --no-owner < "$WORK/db.dump"
docker run --rm -v lims_attachments-data:/data -v "$WORK":/in:ro alpine sh -c 'rm -rf /data/* && tar -xzf /in/attachments.tar.gz -C /data'
docker compose up -d
echo "Live restore of $STAMP complete."
