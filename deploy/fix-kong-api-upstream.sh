#!/usr/bin/env bash

# Fix Kong DB-less services that proxy /api* routes to unresolved upstreams.
# Default target matches Beget Supabase stack layout.

set -u
set -o pipefail

KONG_YML="${KONG_YML:-/opt/beget/supabase/volumes/api/kong.yml}"
KONG_CONTAINER="${KONG_CONTAINER:-supabase-kong}"
UPSTREAM_HOST="${UPSTREAM_HOST:-172.18.0.1}"
UPSTREAM_PORT="${UPSTREAM_PORT:-3000}"
UPSTREAM_PROTOCOL="${UPSTREAM_PROTOCOL:-http}"
UPSTREAM_PATH="${UPSTREAM_PATH:-/}"
APP_HOST="${APP_HOST:-supershrimp.ru}"

if [ ! -f "$KONG_YML" ]; then
  echo "ERROR: kong config not found: $KONG_YML"
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -Fx "$KONG_CONTAINER" >/dev/null 2>&1; then
  echo "ERROR: container '$KONG_CONTAINER' is not running"
  exit 1
fi

BACKUP="${KONG_YML}.bak.$(date +%F-%H%M%S)"
cp "$KONG_YML" "$BACKUP"
echo "Backup created: $BACKUP"

export KONG_YML UPSTREAM_HOST UPSTREAM_PORT UPSTREAM_PROTOCOL UPSTREAM_PATH

python3 - <<'PY'
import re
import os
from pathlib import Path

path = Path(os.environ["KONG_YML"])
host = os.environ["UPSTREAM_HOST"]
port = os.environ["UPSTREAM_PORT"]
protocol = os.environ["UPSTREAM_PROTOCOL"]
base_path = os.environ["UPSTREAM_PATH"]

lines = path.read_text(encoding="utf-8").splitlines(keepends=True)

services_start = None
for i, ln in enumerate(lines):
    if re.match(r"^services:\s*$", ln):
        services_start = i
        break

if services_start is None:
    raise SystemExit("ERROR: services section not found")

services_end = len(lines)
for j in range(services_start + 1, len(lines)):
    if re.match(r"^[A-Za-z0-9_-]+:\s*$", lines[j]):
        services_end = j
        break

section = lines[services_start:services_end]
starts = [i for i, ln in enumerate(section) if re.match(r"^  - name:\s*\S+", ln)]
starts.append(len(section))

patched = []

def upsert(block, key, value):
    pattern = re.compile(rf"^    {key}:\s*.*$")
    for idx, ln in enumerate(block):
        if pattern.match(ln):
            block[idx] = f"    {key}: {value}\n"
            return
    insert_at = None
    for idx, ln in enumerate(block):
        if re.match(r"^    routes:\s*$", ln):
            insert_at = idx
            break
    if insert_at is None:
        block.append(f"    {key}: {value}\n")
    else:
        block.insert(insert_at, f"    {key}: {value}\n")

for start, end in zip(starts[:-1], starts[1:]):
    block = section[start:end]
    text = "".join(block)

    # Identify services that include /api route paths.
    has_api_route = re.search(r"^\s*-\s*/api(?:/|$)", text, flags=re.M) is not None
    if not has_api_route:
        continue

    name_match = re.match(r"^  - name:\s*(\S+)", block[0])
    name = name_match.group(1) if name_match else "<unknown>"

    # If service uses url:, normalize it too.
    for idx, ln in enumerate(block):
        if re.match(r"^    url:\s*.*$", ln):
            block[idx] = f"    url: {protocol}://{host}:{port}{base_path}\n"

    upsert(block, "protocol", protocol)
    upsert(block, "host", host)
    upsert(block, "port", port)
    upsert(block, "path", base_path)

    section[start:end] = block
    patched.append(name)

lines[services_start:services_end] = section
path.write_text("".join(lines), encoding="utf-8")

print("Patched services:")
if patched:
    for item in patched:
        print(f" - {item}")
else:
    print(" - none")
PY

echo "Restarting $KONG_CONTAINER ..."
docker restart "$KONG_CONTAINER" >/dev/null

echo "Checking routes on https://$APP_HOST ..."
curl -i "https://$APP_HOST/api/crypto/status" | sed -n '1,20p'
echo
curl -i "https://$APP_HOST/api/ai/block-templates" | sed -n '1,20p'

echo
echo "Done. Expected status without auth token: 401/403 (not 503)."
