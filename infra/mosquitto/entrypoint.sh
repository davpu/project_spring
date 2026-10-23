#!/bin/sh
set -e

# Create the dynamic-security config with the admin client on first start.
CONFIG=/mosquitto/data/dynamic-security.json
if [ ! -f "$CONFIG" ]; then
  mosquitto_ctrl dynsec init "$CONFIG" "$MQTT_ADMIN_USER" "$MQTT_ADMIN_PASSWORD"
  chown mosquitto:mosquitto "$CONFIG" 2>/dev/null || true
fi

exec /docker-entrypoint.sh "$@"
