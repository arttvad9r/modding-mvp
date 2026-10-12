#!/usr/bin/env bash
# Back up the service database and prove the backup restores.
#
#   PG_CONTAINER=<postgres container> BACKUP_DIR=<dir> bash scripts/backup-restore-drill.sh
#
# 1. pg_dump (custom format) from the running container into BACKUP_DIR, plus a .sha256 file.
# 2. Restore that dump into a throwaway container with no network.
# 3. Verify every application table and the migration ledger exist, and that restored row counts
#    are non-zero where the source has rows and never exceed the source (the source may grow
#    between dump and comparison; it must not shrink).
#
# The source database is only read. No credentials are printed: both containers are accessed
# through the image's local-socket trust, and the throwaway password is random and discarded.
set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:?PG_CONTAINER is required (name of the running postgres container)}"
BACKUP_DIR="${BACKUP_DIR:?BACKUP_DIR is required}"
PG_USER="${PG_USER:-project}"
PG_DB="${PG_DB:-modding_mvp}"
# Must match the source major version (pg_restore must not be older than pg_dump).
PG_IMAGE="${PG_IMAGE:-postgres:18.6-alpine3.24@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873}"
# Optional retention: keep the newest N drill backups in BACKUP_DIR; unset keeps everything.
BACKUP_KEEP="${BACKUP_KEEP:-}"
[[ -z "$BACKUP_KEEP" || "$BACKUP_KEEP" =~ ^[1-9][0-9]*$ ]] || { echo "BACKUP_KEEP must be a positive integer" >&2; exit 1; }
TABLES=(service_users generations beta_survey_responses rate_limit_buckets)

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump="$BACKUP_DIR/modding-mvp-$stamp.dump"
drill="modding-mvp-restore-drill-$stamp"
mkdir -p "$BACKUP_DIR"

cleanup() { docker rm -f "$drill" >/dev/null 2>&1 || true; }
trap cleanup EXIT

count() { # container table -> row count, or "missing"
  docker exec "$1" psql -U "$PG_USER" -d "$PG_DB" -XAtc \
    "select case when to_regclass('public.$2') is null then 'missing' else (select count(*)::text from public.$2) end" 2>/dev/null \
    || echo "missing"
}
migrations() {
  docker exec "$1" psql -U "$PG_USER" -d "$PG_DB" -XAtc \
    "select count(*) from drizzle.__drizzle_migrations" 2>/dev/null || echo "missing"
}

echo "Dumping $PG_DB from $PG_CONTAINER..."
docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" --format=custom --no-owner >"$dump.partial"
mv "$dump.partial" "$dump"
(cd "$BACKUP_DIR" && sha256sum "$(basename "$dump")" >"$(basename "$dump").sha256")
echo "Backup: $dump ($(du -h "$dump" | cut -f1))"

echo "Restoring into throwaway container $drill..."
docker run -d --name "$drill" --network none \
  -e POSTGRES_USER="$PG_USER" -e POSTGRES_DB="$PG_DB" \
  -e POSTGRES_PASSWORD="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')" \
  "$PG_IMAGE" >/dev/null
for _ in $(seq 1 120); do
  # The entrypoint restarts the server after init; wait for the final, socket-only instance.
  if docker exec "$drill" pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1 \
    && docker exec "$drill" psql -U "$PG_USER" -d "$PG_DB" -XAtc "select 1" >/dev/null 2>&1 \
    && [[ "$(docker logs "$drill" 2>&1 | grep -c 'database system is ready to accept connections')" -ge 2 ]]; then
    break
  fi
  sleep 0.5
done
docker exec -i "$drill" pg_restore -U "$PG_USER" -d "$PG_DB" --no-owner --exit-on-error <"$dump"

status=0
printf '%-24s %10s %10s\n' table source restored
for table in "${TABLES[@]}"; do
  source_rows="$(count "$PG_CONTAINER" "$table")"
  restored_rows="$(count "$drill" "$table")"
  printf '%-24s %10s %10s\n' "$table" "$source_rows" "$restored_rows"
  if [[ "$restored_rows" == missing || "$source_rows" == missing ]]; then
    status=1
  elif (( restored_rows > source_rows )) || (( source_rows > 0 && restored_rows == 0 )); then
    status=1
  fi
done
source_migrations="$(migrations "$PG_CONTAINER")"
restored_migrations="$(migrations "$drill")"
printf '%-24s %10s %10s\n' "drizzle migrations" "$source_migrations" "$restored_migrations"
[[ "$restored_migrations" != missing && "$restored_migrations" == "$source_migrations" ]] || status=1

if (( status != 0 )); then
  echo "RESTORE DRILL FAILED: backup $dump did not restore to a matching database." >&2
  exit 1
fi
# Prune only after this backup is proven restorable.
if [[ -n "$BACKUP_KEEP" ]]; then
  ls -1t "$BACKUP_DIR"/modding-mvp-*.dump 2>/dev/null | tail -n +"$((BACKUP_KEEP + 1))" | while read -r old; do
    rm -f -- "$old" "$old.sha256"
  done
fi

echo "RESTORE DRILL PASSED: $dump"
