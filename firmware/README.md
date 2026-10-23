# Firmware (ESP32 node)

One node reads a single planter's sensors and publishes telemetry to the gateway's MQTT broker on the local network. PlatformIO project, Arduino framework, board `esp32dev` (ESP32 DevKitC / WROOM-32E).

The node knows nothing about the cloud. It publishes to `planters/<sensorKey>/telemetry` and the gateway validates the body and republishes it upstream under its own identity. Several nodes share one gateway.

## Wiring

| sensor              | pin    | read as | note                              |
| ------------------- | ------ | ------- | --------------------------------- |
| DHT22 data          | GPIO4  | digital | needs a 10k pull-up to 3V3        |
| soil moisture probe | GPIO34 | analog  | input only, and must stay on ADC1 |

The ADC2 pins cannot be read while the WiFi radio is active. That restriction applies to `analogRead` and the ADC peripheral, **not** to a pin's digital function, so it only constrains the soil probe:

- The soil probe is analog, so it has to be on ADC1 (GPIO32 to GPIO39). On an ADC2 pin it reads fine on the bench and then returns garbage the moment the node associates, which is the classic version of this bug.
- GPIO4 is in fact ADC2_CH0, and that is harmless. The DHT22 speaks a bit-banged one-wire protocol and the library only ever calls `pinMode` and `digitalRead`/`digitalWrite` on it, so the ADC is not involved. There is no reason to move it.

## Configuration

Copy `include/config.h.example` to `include/config.h` and fill in the WiFi and broker details. `config.h` is gitignored because it holds one physical node's credentials.

Everything in it has a default, so the project builds without it, but a node flashed without `config.h` will not reach your network.

`SENSOR_KEY` is optional. Without it the node derives a stable key from its own MAC address (`node-a1b2c3`), so you can flash the same binary to several nodes and each one shows up as a separate planter with no per-device setup. Set it explicitly when you want a name that means something, for example `balcony-1`.

`PUBLISH_INTERVAL_MS` defaults to 30000. A reading is taken immediately before each publish and the DHT22 cannot be sampled more than once every two seconds, so a `static_assert` rejects anything below 2000.

## Testing a real node against the stack

The node talks to the broker in `infra/docker-compose.yml` over the LAN, so three things have to line up: the node is on the same network, it points at the machine's LAN address, and the broker has a client for it.

**1. Bring the stack up** from the repo root:

```bash
docker compose --env-file .env -f infra/docker-compose.yml up -d
```

**2. Create the node's broker client**, once. The broker runs with `allow_anonymous false`, so a node with no client of its own is rejected before it can publish anything. This is the same manual step as the gateway's client and goes away when the API takes over provisioning:

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec mosquitto sh -c '
  mosquitto_ctrl -u "$MQTT_ADMIN_USER" -P "$MQTT_ADMIN_PASSWORD" dynsec createClient node-dev -p node-dev-password
  mosquitto_ctrl -u "$MQTT_ADMIN_USER" -P "$MQTT_ADMIN_PASSWORD" dynsec createRole node-dev
  mosquitto_ctrl -u "$MQTT_ADMIN_USER" -P "$MQTT_ADMIN_PASSWORD" dynsec addRoleACL node-dev publishClientSend "planters/#" allow
  mosquitto_ctrl -u "$MQTT_ADMIN_USER" -P "$MQTT_ADMIN_PASSWORD" dynsec addClientRole node-dev node-dev
'
```

**3. Point the node at the machine, not at itself:**

```bash
ipconfig getifaddr en0    # macOS; this is what MQTT_HOST must be
```

Put that address in `include/config.h` as `MQTT_HOST`, together with the WiFi credentials and `MQTT_USERNAME` / `MQTT_PASSWORD` for the client you just created. `localhost` and `127.0.0.1` point the node at its own chip.

A DHCP lease will eventually move that address, and the node only learns it at flash time, so a literal IP means reflashing every time it changes. Two ways out:

- **An mDNS name**, for example `#define MQTT_HOST "my-mac.local"`. The Arduino ESP32 build has `CONFIG_LWIP_DNS_SUPPORT_MDNS_QUERIES` enabled, so lwIP resolves `.local` names over multicast with no extra code and nothing to initialise. Get the name from `scutil --get LocalHostName` on macOS. Multicast is the catch: some networks filter it, and guest or IoT SSIDs often do.
- **A static DHCP reservation** on the router, tying the machine's MAC to one address. More reliable, but it needs router access.

If the name does not resolve, the serial monitor says so explicitly rather than leaving you to guess, and the literal address always works as a fallback.

**4. Flash and watch the node:**

```bash
pio run -t upload && pio device monitor
```

A healthy start looks like this:

```
node node-a1b2c3 start, publishing to planters/node-a1b2c3/telemetry every 30000 ms
WiFi: connected, ip=192.168.50.57 rssi=-58 dBm
MQTT: connected as node-a1b2c3, publishing to planters/node-a1b2c3/telemetry
soil: raw=2480 -> 42 %
published planters/node-a1b2c3/telemetry {"airTemperature":20.4,"airHumidity":30.3,"soilHumidity":42}
```

**5. Watch both legs from the other side.** This is what tells you whether the node reached the broker and whether the gateway accepted what it sent. Run each in its own terminal:

```bash
# did the node's message arrive at the broker at all?
docker compose --env-file .env -f infra/docker-compose.yml exec mosquitto \
  mosquitto_sub -u node-dev -P node-dev-password -v -t 'planters/#'

# did the gateway validate it and republish it upstream?
docker compose --env-file .env -f infra/docker-compose.yml exec mosquitto \
  mosquitto_sub -u node-dev -P node-dev-password -v -t 'gateways/#'

# and if it was rejected, why
docker compose --env-file .env -f infra/docker-compose.yml logs -f nodered
```

Seeing it on `planters/#` but not on `gateways/#` means the node is fine and the gateway rejected the body; the Node-RED log gives the reason.

### When it does not connect

The serial monitor says which step failed.

| serial output                                       | what it means                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| stuck on `WiFi: connecting to ...`                  | wrong SSID or password, or a 5 GHz network: the ESP32 is 2.4 GHz only                |
| `state=-2 could not reach the broker`               | wrong `MQTT_HOST`, the node is on a different network, or the stack is not up        |
| `cannot resolve ... no mDNS answer`                 | a `.local` `MQTT_HOST` that the network does not answer; use the literal address     |
| `... resolves to X, so the broker is not answering` | the name is fine; the stack is down or the port is not published                     |
| `state=4 bad username or password`                  | the client exists but the password differs from `config.h`                           |
| `state=5 not authorised`                            | the client has no role allowing `publishClientSend` on `planters/#`                  |
| `DHT22: ... read failed`                            | wiring or the missing 10k pull-up; the node still publishes soil humidity on its own |

Guest networks and client isolation are worth ruling out early: they let the node online while blocking it from reaching other devices on the LAN.

## Soil calibration

`SOIL_RAW_DRY` and `SOIL_RAW_WET` default to 3200 and 1510, measured on this project's probe. A different probe needs its own numbers: flash the node, watch `soil: raw=...` in the serial monitor, note the value with the probe in air and then submerged, and override both in `config.h`.

The raw value falls as the soil gets wetter, so `SOIL_RAW_DRY` is the larger of the two. The firmware maps that range onto 0 to 100 % and clamps to the contract's bounds, so a probe reading past either calibration point reports 0 or 100 rather than something nonsensical.

## Build and flash

```bash
pio run                 # build
pio run -t upload       # flash over USB
pio device monitor       # serial output at 115200
```

## The contract

`include/contract.h` is generated from `libs/shared` by `pnpm contract:gen` in the repo root. Do not edit it. It provides the topic helper, the sensor key pattern, the per-field bounds and resolution, and `contract::serialize()`.

Every measurement is optional, so a node whose DHT22 fails still reports soil humidity rather than dropping the whole reading. A reading with nothing in it serializes to zero bytes and is not published, which matches the contract's requirement of at least one measurement.

`contract::serialize()` rounds each field to the resolution the contract allows, so the firmware cannot publish more precision than the sensor delivers and then have the gateway reject it.

## Known gaps

- PubSubClient only publishes at QoS 0, while the gateway subscribes at QoS 1. A message lost between the node and the gateway is not retried.
- The node does not pair with the API. Its broker credentials are set at flash time, and the gateway's own identity is configured by hand, so nothing here reflects the pairing flow in `libs/shared/src/lib/pairing.ts` yet.
- There is no sleep or power management. The node is assumed to be mains powered.
