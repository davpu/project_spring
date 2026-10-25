#!/bin/sh
# Restarts the broker if Caddy has renewed the certificate since the broker
# copied it. Caddy renews about a month before expiry; run this weekly from
# cron (see docs/deploy.md). Does nothing when the certificate is unchanged.
set -eu

cd "$(dirname "$0")/../.."
COMPOSE="docker compose --env-file ${ENV_FILE:-.env.production} -f infra/docker-compose.prod.yml"

# Compare fingerprints rather than testing an exit code, so that a failure to
# reach the container stops the script instead of looking like a new certificate.
current=$($COMPOSE exec -T mosquitto sh -c 'sha256sum < "$TLS_CERT"')
loaded=$($COMPOSE exec -T mosquitto sh -c 'sha256sum < /mosquitto/certs/fullchain.pem')

if [ "$current" != "$loaded" ]; then
  echo "Certificate changed, restarting the broker"
  $COMPOSE restart mosquitto
fi
