# project_spring

Plant vitals monitor: an ESP32 node reads a planter's sensors, a gateway forwards the readings over MQTT, and a backend stores and serves them to a web dashboard.

```
ESP32 node -> gateway -> MQTT broker -> API -> database
                                           \-> web
```

## Repo layout

```
apps/
  api/      # NestJS backend - Nx skeleton only, no business logic yet
  web/      # React dashboard - Nx skeleton only, no business logic yet
libs/
  shared/   # contracts used by api/web/gateway: metrics, MQTT topics, pairing
  db/       # Drizzle schema and Postgres/TimescaleDB client
infra/
  docker-compose.yml   # local Postgres + TimescaleDB, MQTT broker and gateway
  nodered/             # the gateway: flow, settings and the generated contract
firmware/
  include/contract.h   # generated C++ contract for the ESP32 (no firmware yet)
```

## Telemetry contract

A gateway publishes one JSON payload per planter. At least one measurement is required, unknown keys are rejected, and an optional `ts` (ISO 8601 with a UTC offset) overrides the server's receive time.

```json
{ "airTemperature": 20.4, "airHumidity": 30, "soilHumidity": 40 }
```

| field            | type    | unit | range     | resolution    |
| ---------------- | ------- | ---- | --------- | ------------- |
| `airTemperature` | number  | °C   | unbounded | -             |
| `airHumidity`    | number  | %    | 0 to 100  | 0.1           |
| `soilHumidity`   | integer | %    | 0 to 100  | whole numbers |

These field names are also the metric ids stored in the `readings` table, so nothing is renamed between the wire and the database. The source of truth for all of this is `libs/shared`, in particular `libs/shared/src/lib/metrics.ts`.

### MQTT topics

Defined in `libs/shared/src/lib/topics.ts`:

- Node to gateway, on the local broker: `planters/{sensorKey}/telemetry`. A node does not know its `gatewayId`, so it publishes under its sensor key alone.
- Gateway to cloud: `gateways/{gatewayId}/planters/{sensorKey}/telemetry`
- Status: `gateways/{gatewayId}/status`, a plain-text `online`/`offline` where `offline` is the MQTT last will
- Server-side subscriptions use the filters `gateways/+/planters/+/telemetry` and `gateways/+/status`

`gatewayId` is the gateway's UUID (it doubles as its MQTT username). `sensorKey` is a gateway-chosen planter identifier matching `^[a-z0-9][a-z0-9_-]{0,63}$` (lowercase letters, digits, `-` and `_`, max 64 characters).

## Pairing

A gateway has to be paired with a user account before it can publish anything. From `libs/shared/src/lib/pairing.ts`:

1. The user creates a pairing code in the web app (giving the gateway a name). The API returns an 8-character code from the alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no `I`, `L`, `O`, `0` or `1`, so it survives being read aloud), displayed as e.g. `ABCD-2345`. The code expires after 10 minutes.
2. The gateway redeems the code over HTTPS.
3. The API responds with the gateway's `gatewayId`, its MQTT credentials, and the topic templates to publish on.
4. The web app polls the pairing status until it is `redeemed` (or `expired`).

## Gateway

The gateway is Node-RED (`infra/nodered`). It subscribes to `planters/+/telemetry` on the local broker, validates the body against the contract, and republishes it upstream under its own identity. It does not transform the payload: the exact bytes a node sent are what the API receives, so there is no second place where telemetry could be reshaped.

Anything the gateway and the firmware cannot import from TypeScript is generated from `libs/shared`:

```bash
pnpm contract:gen
```

| artifact                                       | consumer                              |
| ---------------------------------------------- | ------------------------------------- |
| `infra/nodered/contract/telemetry.schema.json` | Node-RED's core `json` node           |
| `infra/nodered/contract/contract.json`         | the gateway flow (topics, key format) |
| `firmware/include/contract.h`                  | the ESP32 firmware                    |

These files are committed and must not be edited by hand. `pnpm nx test shared` fails if they drift from the schema, so CI catches a forgotten regeneration. After regenerating, `docker compose --env-file .env -f infra/docker-compose.yml restart nodered` is enough; the flow itself does not change.

The JSON Schema is emitted as draft-07 and with no `format` keywords, because Node-RED 4.0 builds its validator as `new Ajv()` on ajv 8 and refuses to compile a schema containing an unknown format.

### Running the gateway locally

Pairing is not implemented yet, so the gateway's identity and broker credentials are set by hand. Put a UUID in `GATEWAY_ID` in `.env`, then create its broker client once (the broker runs with `allow_anonymous false` and the dynamic-security plugin, which the API will eventually drive):

```bash
docker compose --env-file .env -f infra/docker-compose.yml exec mosquitto sh -c '
  mosquitto_ctrl -u "$MQTT_ADMIN_USER" -P "$MQTT_ADMIN_PASSWORD" dynsec createClient gateway-dev -p gateway-dev-password
  mosquitto_ctrl -u "$MQTT_ADMIN_USER" -P "$MQTT_ADMIN_PASSWORD" dynsec createRole gateway-dev
  mosquitto_ctrl -u "$MQTT_ADMIN_USER" -P "$MQTT_ADMIN_PASSWORD" dynsec addRoleACL gateway-dev subscribePattern "planters/+/telemetry" allow
  mosquitto_ctrl -u "$MQTT_ADMIN_USER" -P "$MQTT_ADMIN_PASSWORD" dynsec addRoleACL gateway-dev publishClientReceive "planters/#" allow
  mosquitto_ctrl -u "$MQTT_ADMIN_USER" -P "$MQTT_ADMIN_PASSWORD" dynsec addRoleACL gateway-dev publishClientSend "gateways/#" allow
  mosquitto_ctrl -u "$MQTT_ADMIN_USER" -P "$MQTT_ADMIN_PASSWORD" dynsec addClientRole gateway-dev gateway-dev
'
```

The editor is on http://localhost:1880, bound to localhost only. Node-RED substitutes an `${ENV_VAR}` reference only when it is a field's entire value, which is why the composed client id comes from `MQTT_CLIENT_ID` in the compose file. Broker credentials live in `infra/nodered/data/flows_cred.json` as `${ENV_VAR}` references, so that file holds no secrets and is committed unencrypted.

## Requirements

- Node 24 (see `.nvmrc`)
- pnpm 12.9.1 (pinned via `packageManager` in `package.json`)
- Docker, for the local Postgres/TimescaleDB and MQTT stack

## Getting started

```bash
pnpm install
cp .env.example .env
docker compose --env-file .env -f infra/docker-compose.yml up -d
pnpm db:migrate
```

Then run an app or a test suite through Nx, for example:

```bash
pnpm nx serve api
pnpm nx serve web
pnpm nx test shared
```

## Development

```bash
pnpm nx run-many -t lint test build typecheck
pnpm nx format:check
pnpm nx test shared
```

CI (`.github/workflows/ci.yml`) runs `pnpm nx format:check` and `pnpm nx run-many -t lint test build typecheck` on every push to `main` and on every pull request.

## Status

- `libs/shared` (telemetry contract, MQTT topics, pairing) and `libs/db` (Drizzle schema for users, gateways, pairing codes, planters, plants and readings) are implemented.
- `apps/api` and `apps/web` are still Nx skeletons: no controllers, no routes, no UI beyond the generated starter page.
- The gateway validates and forwards telemetry, and the generated contract artifacts are in place.
- There is no MQTT ingest in the API yet, so telemetry the gateway forwards is not persisted.
- Pairing is defined in `libs/shared` but no API endpoint implements it, so the gateway's `gatewayId` and broker credentials are configured by hand.
- The gateway does not publish its `online`/`offline` status yet.
- There is no ESP32 firmware in this repo yet, only the generated `contract.h` it will include.
