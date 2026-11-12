#!/usr/bin/env bash
# Run the schema + security tests against a throwaway local Postgres.
# Usage: supabase/tests/run-local.sh   (needs Postgres 15+ binaries installed)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA="$(mktemp -d)"; PORT="${PORT:-54329}"
cleanup() { $RUNAS "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
if [ "$(id -u)" = 0 ]; then RUNAS="runuser -u postgres --"; chown postgres "$DATA"; else RUNAS=""; fi
trap cleanup EXIT
$RUNAS "$PGBIN/initdb" -D "$DATA" -U postgres >/dev/null 2>&1
$RUNAS "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA/log" start >/dev/null
PSQL=(psql -h /tmp -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -tA -o /dev/null)
"${PSQL[@]}" -d postgres -c "create database canopy" >/dev/null
"${PSQL[@]}" -d canopy -f "$HERE/auth_stub.sql"
for m in "$HERE"/../migrations/*.sql; do
  case "$m" in *_storage.sql) continue ;; esac  # needs Supabase storage schema
  "${PSQL[@]}" -d canopy -f "$m"
done
"${PSQL[@]}" -d canopy -f "$HERE/rls.test.sql" 2>&1 | sed -n "s/.*NOTICE:  //p"
echo "All database tests passed."
