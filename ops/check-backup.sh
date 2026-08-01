#!/bin/bash
set -euo pipefail

work=$(mktemp -d)
case "$work" in /tmp/*) ;; *) echo "Directorio temporal inesperado: $work" >&2; exit 1 ;; esac
trap 'rm -rf -- "$work"' EXIT

mkdir "$work/bin" "$work/backups"
printf '%s\n' '#!/bin/sh' \
  'case "$1" in' \
  '  ps) printf "%s\n" "creacontenidos-check-db-1" ;;' \
  '  exec) printf "%s\n" "-- PostgreSQL database dump" "CREATE TABLE check_backup(id int);" ;;' \
  '  *) exit 2 ;;' \
  'esac' > "$work/bin/docker"
printf '%s\n' '#!/bin/sh' 'printf "%s\n" "$*" > "$MOCK_CURL_LOG"' > "$work/bin/curl"
chmod 700 "$work/bin/docker" "$work/bin/curl"

printf 'anterior\n' | gzip > "$work/backups/crea_command_center_20000101_000000.sql.gz"
touch -d '16 days ago' "$work/backups/crea_command_center_20000101_000000.sql.gz"
printf '%s\n' 'https://heartbeat.invalid/check' > "$work/backups/heartbeat-url"

MOCK_CURL_LOG="$work/curl.log" BACKUP_DIR="$work/backups" PATH="$work/bin:$PATH" \
  bash "$(dirname "$0")/backup_db.sh"

dump=$(find "$work/backups" -maxdepth 1 -name 'crea_command_center_*.sql.gz' -print)
[ -n "$dump" ] && [ ! -e "$work/backups/crea_command_center_20000101_000000.sql.gz" ]
gzip -t "$dump"
[ "$(stat -c %a "$work/backups")" = 700 ]
[ "$(stat -c %a "$dump")" = 600 ]
[ "$(stat -c %a "$work/backups/backup.log")" = 600 ]
grep -q 'heartbeat.invalid/check' "$work/curl.log"
grep -q ' OK: ' "$work/backups/backup.log"

echo 'check-backup: PASS'
