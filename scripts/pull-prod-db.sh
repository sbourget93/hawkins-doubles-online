#!/usr/bin/env bash

# NOTE: Stop the local docker-compose stack before running this. If the stack was running,
# bring the stack back up afterward to load the freshly pulled prod data.set

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
rm -f backend/hawkins.db-wal backend/hawkins.db-shm
