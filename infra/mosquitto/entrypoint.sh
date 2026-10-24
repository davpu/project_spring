#!/bin/sh
set -e

# Create the dynamic-security config with the admin client on first start.
CONFIG=/mosquitto/data/dynamic-security.json
if [ ! -f "$CONFIG" ]; then
  mosquitto_ctrl dynsec init "$CONFIG" "$MQTT_ADMIN_USER" "$MQTT_ADMIN_PASSWORD"
  chown mosquitto:mosquitto "$CONFIG" 2>/dev/null || true
fi

# Production: use the certificate Caddy obtained. It is copied rather than
# mounted because the key is readable by root only and the broker runs as its
# own user. On the first deploy Caddy may not have it yet, so wait for it.
if [ -n "$TLS_CERT" ]; then
  until [ -f "$TLS_CERT" ] && [ -f "$TLS_KEY" ]; do
    echo "Waiting for the TLS certificate at $TLS_CERT"
    sleep 3
  done
  mkdir -p /mosquitto/certs
  cp "$TLS_CERT" /mosquitto/certs/fullchain.pem
  cp "$TLS_KEY" /mosquitto/certs/privkey.pem
  chown mosquitto:mosquitto /mosquitto/certs/fullchain.pem /mosquitto/certs/privkey.pem
  chmod 600 /mosquitto/certs/privkey.pem
fi

exec /docker-entrypoint.sh "$@"
