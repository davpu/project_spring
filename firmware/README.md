# Firmware (ESP32 node)

One node reads a single planter's sensors and publishes telemetry to the gateway's MQTT broker on the local network. PlatformIO project, Arduino framework, board `esp32dev` (ESP32 DevKitC / WROOM-32E).

The node knows nothing about the cloud. It publishes to `planters/<sensorKey>/telemetry` and the gateway validates the body and republishes it upstream under its own identity. Several nodes share one gateway.

## Wiring

| sensor              | pin    | note                                                  |
| ------------------- | ------ | ----------------------------------------------------- |
| DHT22 data          | GPIO4  | needs a 10k pull-up to 3V3                            |
| soil moisture probe | GPIO34 | input only, and ADC1: ADC2 does not work with WiFi on |

If you move the soil probe, keep it on ADC1 (GPIO32 to GPIO39). ADC2 is unavailable while the WiFi radio is active, which is the usual cause of a probe that reads fine until the node connects.

## Configuration

Copy `include/config.h.example` to `include/config.h` and fill in the WiFi and broker details. `config.h` is gitignored because it holds one physical node's credentials.

Everything in it has a default, so the project builds without it, but a node flashed without `config.h` will not reach your network.

`SENSOR_KEY` is optional. Without it the node derives a stable key from its own MAC address (`node-a1b2c3`), so you can flash the same binary to several nodes and each one shows up as a separate planter with no per-device setup. Set it explicitly when you want a name that means something, for example `balcony-1`.

`PUBLISH_INTERVAL_MS` defaults to 30000. A reading is taken immediately before each publish and the DHT22 cannot be sampled more than once every two seconds, so a `static_assert` rejects anything below 2000.

## Soil calibration

`SOIL_RAW_DRY` and `SOIL_RAW_WET` default to the full 12-bit range, which is almost certainly wrong for your probe. Measure it: flash the node, watch the serial monitor, and note the raw value with the probe in air and then submerged in water. Put those two numbers in `config.h`.

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
