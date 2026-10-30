#!/usr/bin/env bash
# GBC LIMS nightly backup: Postgres dump + attachments volume -> S3.
#
# Run on the VPS from /opt/lims (cron example in PRODUCTION_READINESS.md):
#   ./scripts/backup-db.sh
#
# Needs: docker, aws CLI configured with credentials that can ONLY write to
# BACKUP_S3_BUCKET (separate from shopkeeper's bucket/credentials).
# Reads POSTGRES_USER / POSTGRES_DB / BACKUP_S3_BUCKET from /opt/lims/.env.

set -euo pipefail

cd "$(dirname "$0")/.."
set -a; source ./.env; set +a

: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET must be set in .env}"
PG_CONTAINER="${PG_CONTAINER:-lims-postgres-1}"
ATTACH_VOLUME="${ATTACH_VOLUME:-lims_attachments-data}"
PGUSER_="${POSTGRES_USER:-lims}"
PGDB_="${POSTGRES_DB:-lims}"

STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

log() { echo "[$(date -u +%FT%TZ)] $*"; }
fail() { log "BACKUP FAILED: $*"; [ -n "${BACKUP_ALERT_WEBHOOK:-}" ] && curl -fsS -m 10 -X POST -H 'Content-Type: application/json' -d "{\"text\":\"GBC LIMS backup FAILED on $(hostname): $*\"}" "$BACKUP_ALERT_WEBHOOK" || true; exit 1; }
trap 'fail "line $LINENO"' ERR

# 1. Database (custom format: compressed, restorable with pg_restore)
log "Dumping database $PGDB_ ..."
docker exec "$PG_CONTAINER" pg_dump -U "$PGUSER_" -d "$PGDB_" -Fc --no-owner > "$WORK/db.dump"
[ -s "$WORK/db.dump" ] || fail "database dump is empty"

# 2. Uploaded files (attachments live in a Docker volume, NOT in Postgres)
log "Archiving attachments volume $ATTACH_VOLUME ..."
docker run --rm -v "$ATTACH_VOLUME":/data:ro -v "$WORK":/out alpine \
  tar -czf /out/attachments.tar.gz -C /data .

# 3. Checksums so a restore can verify integrity
( cd "$WORK" && sha256sum db.dump attachments.tar.gz > SHA256SUMS )

# 4. Upload (server-side encryption on)
DEST="s3://$BACKUP_S3_BUCKET/daily/$STAMP"
log "Uploading to $DEST ..."
aws s3 cp "$WORK/db.dump"            "$DEST/db.dump"            --sse AES256 --only-show-errors
aws s3 cp "$WORK/attachments.tar.gz" "$DEST/attachments.tar.gz" --sse AES256 --only-show-errors
aws s3 cp "$WORK/SHA256SUMS"         "$DEST/SHA256SUMS"         --sse AES256 --only-show-errors

# First of the month: also keep a monthly copy (retention handled by S3 lifecycle rules)
if [ "$(date -u +%d)" = "01" ]; then
  aws s3 cp --recursive "$DEST/" "s3://$BACKUP_S3_BUCKET/monthly/$STAMP/" --sse AES256 --only-show-errors
fi

log "Backup OK: $DEST ($(du -h "$WORK/db.dump" | cut -f1) db, $(du -h "$WORK/attachments.tar.gz" | cut -f1) files)"
