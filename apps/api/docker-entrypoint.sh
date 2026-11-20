#!/bin/sh
set -eu

db="${DATABASE_PATH:-/data/mops.sqlite}"
if [ -f "$db" ]; then
  echo "Database already present at ${db}; skipping demo seed."
else
  echo "No database at ${db}; seeding demo data once."
  node apps/api/dist/seed-cli.js
fi

exec node apps/api/dist/index.js
