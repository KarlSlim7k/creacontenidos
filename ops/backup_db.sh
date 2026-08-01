#!/bin/bash
umask 077
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/backups/creacontenidos}"
DB="crea_command_center"
RETENTION_DAYS=14
LOG="$BACKUP_DIR/backup.log"
HEARTBEAT_FILE="$BACKUP_DIR/heartbeat-url"

install -d -m 700 "$BACKUP_DIR"
touch "$LOG"
chmod 600 "$LOG"

CONTAINER=$(docker ps --format '{{.Names}}' | grep -m1 'creacontenidos.*-db-1$' || true)

if [ -z "$CONTAINER" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') ERROR: no se encontro el contenedor de DB de creacontenidos" >> "$LOG"
  exit 1
fi

TS=$(date +%Y%m%d_%H%M%S)
OUT="$BACKUP_DIR/${DB}_${TS}.sql.gz"
TMP="${OUT}.tmp"
trap 'rm -f "$TMP"' EXIT

if docker exec "$CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' 2>>"$LOG" | gzip > "$TMP" \
  && [ -s "$TMP" ] && gzip -t "$TMP"; then
  chmod 600 "$TMP"
  mv "$TMP" "$OUT"
  SIZE=$(du -h "$OUT" | cut -f1)
  echo "$(date '+%Y-%m-%d %H:%M:%S') OK: $OUT ($SIZE)" >> "$LOG"
else
  echo "$(date '+%Y-%m-%d %H:%M:%S') ERROR: fallo el pg_dump, revisar $LOG" >> "$LOG"
  exit 1
fi

find "$BACKUP_DIR" -name "${DB}_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete

# El monitor externo solo recibe éxito después de validar y publicar el dump.
if [ -s "$HEARTBEAT_FILE" ]; then
  if ! curl -fsS --max-time 10 --retry 2 "$(cat "$HEARTBEAT_FILE")" >/dev/null; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') ERROR: no se pudo notificar el heartbeat" >> "$LOG"
    exit 1
  fi
fi
