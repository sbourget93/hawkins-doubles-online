#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

ssh ubuntu@hawkinsdubs.stephengb.com 'bash -s' <<'REMOTE'
docker exec -i backend python - <<'PY'
import sqlite3
src = sqlite3.connect("/app/hawkins.db")
dst = sqlite3.connect("/tmp/snapshot.db")
with dst:
    src.backup(dst)
PY
docker cp backend:/tmp/snapshot.db /tmp/snapshot.db
REMOTE

scp ubuntu@hawkinsdubs.stephengb.com:/tmp/snapshot.db backend/hawkins.db
