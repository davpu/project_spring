// ESP32 node: reads one planter's sensors and publishes telemetry to the
// gateway's local MQTT broker.
//
// The node is deliberately unaware of the cloud. It knows only its own sensor
// key and publishes to planters/<sensorKey>/telemetry; the gateway validates
// the body and republishes it upstream under its own identity. Several nodes
// can share one gateway, which is why the sensor key defaults to something
// unique per device rather than a compile-time constant.
#include <Arduino.h>
#include <DHT.h>
#include <PubSubClient.h>
#include <WiFi.h>

#include "contract.h"

#if __has_include("config.h")
#include "config.h"
#endif

#ifndef WIFI_SSID
#define WIFI_SSID "change-me"
#endif
#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD "change-me"
#endif
#ifndef MQTT_HOST
#define MQTT_HOST "192.168.1.10"
#endif
#ifndef MQTT_PORT
#define MQTT_PORT 1883
#endif
#ifndef MQTT_USERNAME
#define MQTT_USERNAME "node-dev"
#endif
#ifndef MQTT_PASSWORD
#define MQTT_PASSWORD "node-dev-password"
#endif
#ifndef PUBLISH_INTERVAL_MS
#define PUBLISH_INTERVAL_MS 30000
#endif

// Measured on this project's probe: raw ADC in air, then submerged. A
// different probe needs its own numbers, so both are overridable in config.h.
#ifndef SOIL_RAW_DRY
#define SOIL_RAW_DRY 3200
#endif
#ifndef SOIL_RAW_WET
#define SOIL_RAW_WET 1510
#endif

static_assert(SOIL_RAW_DRY != SOIL_RAW_WET,
              "soil calibration endpoints must differ");

constexpr int PIN_DHT = 4;   // DHT22 data, with a 10k pull-up to 3V3
constexpr int PIN_SOIL = 34; // soil probe; ADC1 only, ADC2 is dead with WiFi on

// The DHT22 cannot be sampled faster than once every two seconds, and a
// reading is taken immediately before each publish.
static_assert(PUBLISH_INTERVAL_MS >= 2000,
              "PUBLISH_INTERVAL_MS must be at least 2000 for the DHT22");

constexpr unsigned long WIFI_RETRY_MS = 5000;
constexpr unsigned long MQTT_RETRY_MS = 5000;

DHT dht(PIN_DHT, DHT22);
WiFiClient net;
PubSubClient mqtt(net);

// "node-" plus six hex digits, or SENSOR_KEY. Both match the contract's
// SENSOR_KEY_PATTERN.
char sensorKey[65];
char telemetryTopic[128];

static void deriveSensorKey() {
#ifdef SENSOR_KEY
  snprintf(sensorKey, sizeof(sensorKey), "%s", SENSOR_KEY);
#else
  uint8_t mac[6] = {0};
  WiFi.macAddress(mac);
  snprintf(sensorKey, sizeof(sensorKey), "node-%02x%02x%02x", mac[3], mac[4],
           mac[5]);
#endif
}

static bool ensureWifi() {
  static bool announced = false;

  if (WiFi.status() == WL_CONNECTED) {
    if (!announced) {
      Serial.printf("WiFi: connected, ip=%s rssi=%d dBm\n",
                    WiFi.localIP().toString().c_str(), WiFi.RSSI());
      announced = true;
    }
    return true;
  }
  announced = false;

  static unsigned long lastAttempt = 0;
  const unsigned long now = millis();
  if (lastAttempt != 0 && now - lastAttempt < WIFI_RETRY_MS) {
    return false;
  }
  lastAttempt = now;

  Serial.printf("WiFi: connecting to %s\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  return false;
}

// PubSubClient only reports a number, and the difference between "the broker
// is unreachable" and "the broker rejected these credentials" is exactly what
// you need when bringing a node up on a new network.
static const char* mqttStateText(int state) {
  switch (state) {
    case -4:
      return "timed out waiting for the broker";
    case -3:
      return "connection lost";
    case -2:
      return "could not reach the broker - wrong MQTT_HOST, or not on this LAN";
    case -1:
      return "disconnected cleanly";
    case 0:
      return "connected";
    case 1:
      return "broker refused the protocol version";
    case 2:
      return "broker rejected the client id";
    case 3:
      return "broker unavailable";
    case 4:
      return "bad username or password";
    case 5:
      return "not authorised - the client exists but its ACLs forbid this";
    default:
      return "unknown";
  }
}

static bool ensureMqtt() {
  if (mqtt.connected()) {
    return true;
  }

  static unsigned long lastAttempt = 0;
  const unsigned long now = millis();
  if (lastAttempt != 0 && now - lastAttempt < MQTT_RETRY_MS) {
    return false;
  }
  lastAttempt = now;

  // The client id doubles as the node's identity on the broker, so two nodes
  // never kick each other off the way a shared id would.
  if (mqtt.connect(sensorKey, MQTT_USERNAME, MQTT_PASSWORD)) {
    Serial.printf("MQTT: connected as %s, publishing to %s\n", sensorKey,
                  telemetryTopic);
    return true;
  }

  const int state = mqtt.state();
  Serial.printf("MQTT: connect to %s:%d failed, state=%d (%s)\n", MQTT_HOST,
                MQTT_PORT, state, mqttStateText(state));
  return false;
}

static int soilPercent(int raw) {
  const int percent = map(raw, SOIL_RAW_DRY, SOIL_RAW_WET, 0, 100);
  return constrain(percent, contract::SOIL_HUMIDITY_MIN,
                   contract::SOIL_HUMIDITY_MAX);
}

// Every measurement is optional in the contract, so a failed or out-of-range
// sensor is left out instead of dropping the whole reading or publishing a
// body the gateway would reject.
static contract::TelemetryPayload readSensors() {
  contract::TelemetryPayload reading;

  const float temperature = dht.readTemperature();
  const float humidity = dht.readHumidity();

  if (isnan(temperature)) {
    Serial.println("DHT22: temperature read failed");
  } else {
    reading.airTemperature = temperature;
  }

  if (isnan(humidity)) {
    Serial.println("DHT22: humidity read failed");
  } else if (humidity < contract::AIR_HUMIDITY_MIN ||
             humidity > contract::AIR_HUMIDITY_MAX) {
    Serial.printf("DHT22: humidity %.1f out of contract range\n", humidity);
  } else {
    reading.airHumidity = humidity;
  }

  const int soilRaw = analogRead(PIN_SOIL);
  reading.soilHumidity = soilPercent(soilRaw);
  Serial.printf("soil: raw=%d -> %d %%\n", soilRaw, *reading.soilHumidity);

  return reading;
}

static void publishReading() {
  const contract::TelemetryPayload reading = readSensors();

  char body[192];
  const size_t written = contract::serialize(reading, body, sizeof(body));
  if (written == 0) {
    Serial.println("no usable measurement, nothing to publish");
    return;
  }
  if (written >= sizeof(body) - 1) {
    Serial.println("payload truncated, not publishing");
    return;
  }

  if (mqtt.publish(telemetryTopic, body)) {
    Serial.printf("published %s %s\n", telemetryTopic, body);
  } else {
    Serial.println("publish failed");
  }
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);
  dht.begin();

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  deriveSensorKey();

  const int needed =
      contract::telemetryTopic(sensorKey, telemetryTopic, sizeof(telemetryTopic));
  if (needed < 0 || static_cast<size_t>(needed) >= sizeof(telemetryTopic)) {
    Serial.println("sensor key too long for the topic buffer, halting");
    while (true) {
      delay(1000);
    }
  }

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(256);

  Serial.printf("node %s start, publishing to %s every %lu ms\n", sensorKey,
                telemetryTopic, static_cast<unsigned long>(PUBLISH_INTERVAL_MS));
  delay(2000); // the DHT22 needs a moment after power-on
}

void loop() {
  if (!ensureWifi()) {
    delay(100);
    return;
  }
  if (!ensureMqtt()) {
    delay(100);
    return;
  }
  mqtt.loop();

  static unsigned long lastPublish = 0;
  const unsigned long now = millis();
  if (lastPublish == 0 || now - lastPublish >= PUBLISH_INTERVAL_MS) {
    lastPublish = now;
    publishReading();
  }

  delay(50);
}
