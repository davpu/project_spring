#!/bin/sh
# Creates .env.production with freshly generated secrets. Run once, on the
# server, from the repository root:  sh infra/prod/init-env.sh clinio.cz
# The secrets never leave the server and are not committed (.env.* is ignored).
set -eu

if [ $# -ne 1 ]; then
  echo "usage: $0 <domain>" >&2
  exit 1
fi

OUT=.env.production
if [ -e "$OUT" ]; then
  echo "$OUT already exists, not overwriting it" >&2
  exit 1
fi

umask 077
# Hex only, so the values are safe inside a connection URL.
rand() { openssl rand -hex "$1"; }

cat > "$OUT" <<EOF
DOMAIN=$1
POSTGRES_PASSWORD=$(rand 24)
JWT_SECRET=$(rand 32)
MQTT_ADMIN_USER=api
MQTT_ADMIN_PASSWORD=$(rand 24)
EOF

echo "Wrote $OUT (readable by you only)"
