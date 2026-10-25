# project_spring

Plant vitals monitor: an ESP32 node reads a planter's sensors, a gateway forwards the readings over MQTT, and a backend stores and serves them to a web dashboard.

```
ESP32 node -> gateway -> MQTT broker -> API -> database
                                           \-> web
```

## Repo layout

```
apps/
  api/      # NestJS backend: auth, pairing, MQTT ingest, read API
  web/      # React dashboard - Nx skeleton only, no business logic yet
libs/
  shared/   # contracts used by api/web/gateway: metrics, MQTT topics, pairing
  db/       # Drizzle schema and Postgres/TimescaleDB client
infra/
  docker-compose.yml   # local Postgres + TimescaleDB, MQTT broker and gateway
  nodered/             # the gateway: flow, settings and the generated contract
firmware/             # ESP32 node, PlatformIO - see firmware/README.md
  include/contract.h   # generated C++ contract, do not edit by hand
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

Resolution is what a producer rounds to before publishing (`METRIC_RESOLUTION`), not something the schema enforces. `multipleOf` on a non-integer is not portable: Zod checks it float-safely while the ajv build inside Node-RED rejects about a third of all one-decimal values, so in the schema it dropped valid readings and made the generated validator disagree with the Zod one it is generated from. Whole-number metrics are still enforced as `integer`, which both agree on.

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

## API

NestJS, under the `/api` prefix. Request and response shapes live in `libs/shared/src/lib/api.ts`; [docs/api.md](docs/api.md) has the details with examples and error codes. Everything except `/api/health`, `/api/auth/register`, `/api/auth/login` and `/api/pair` needs the session cookie that register and login set.

| route                                         | purpose                                                           |
| --------------------------------------------- | ----------------------------------------------------------------- |
| `POST /auth/register`, `POST /auth/login`     | create an account / sign in (sets an `HttpOnly` session cookie)   |
| `POST /auth/logout`, `GET /auth/me`           | sign out / who am I                                               |
| `POST /pairing-codes`                         | start pairing, returns the code to type into the gateway          |
| `GET /pairing-codes/:id`                      | `pending`, `redeemed` (with the new `gatewayId`) or `expired`     |
| `POST /pair`                                  | **gateway, no session:** redeem a code for broker credentials     |
| `GET /gateways`, `DELETE /gateways/:id`       | list / unpair (revokes the gateway's broker client)               |
| `GET /planters`, `GET /planters/:id`          | planters with their newest value per metric / one with its plants |
| `PATCH /planters/:id`, `DELETE /planters/:id` | rename / delete with its plants and readings                      |
| `GET /planters/:id/readings`                  | `?metric=&from=&to=&bucket=raw\|hour\|day`, see below             |
| `POST /planters/:id/plants`                   | add a plant; `PATCH`/`DELETE /plants/:id` to change or remove it  |
| `GET /health`                                 | database and broker connectivity                                  |

`bucket` defaults to `raw` for ranges up to 6 hours, `hour` up to 14 days and `day` beyond that, and the range defaults to the last 24 hours. Hourly and daily points come from the `readings_hourly` continuous aggregate, which includes data not yet materialized, so the newest hour is never missing. A daily average is weighted by sample count, not an average of hourly averages. A raw response is capped at 10 000 points and hourly at 92 days; asking for more is a 400 that says which bucket to use.

A planter you did not create does not exist: someone else's id answers 404, the same as an unknown one.

### Ingest

The API connects to the broker as the dynamic-security admin, grants itself a read role for `gateways/+/planters/+/telemetry`, and subscribes. Which gateway a message is for comes from its topic, and the broker only lets a gateway publish under its own id. A planter is created the first time a gateway reports a new `sensorKey`, named after it, so a new node needs no setup; rename it with `PATCH /planters/:id`. Messages that fail the contract, carry a timestamp more than a year old or a day ahead, or name a gateway that does not exist are dropped and logged, never stored.

The first time the API starts against a fresh broker, granting itself that role makes the broker drop its connection once. It reconnects and carries on; the log shows a "connection lost during setup" warning.

### Pairing, end to end

```bash
# signed-in user: start pairing
curl -b cookies -X POST localhost:3000/api/pairing-codes -H 'Content-Type: application/json' -d '{"gatewayName":"Balkon"}'
# gateway: redeem the code (no session)
curl -X POST localhost:3000/api/pair -H 'Content-Type: application/json' -d '{"code":"ABCD-2345"}'
```

The response holds `gatewayId`, the broker URL, username (the `gatewayId`) and password, and the topic templates. The password is shown once and never stored by the API. If creating the broker client fails, the code is not consumed and the gateway can retry.

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

The Node-RED flow does not call `/api/pair` yet, so the gateway's identity and broker credentials are still set by hand. Put a UUID in `GATEWAY_ID` in `.env`, then create its broker client once (the broker runs with `allow_anonymous false` and the dynamic-security plugin, which the API will eventually drive):

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
cp .env.example .env        # set JWT_SECRET to your own value
docker compose --env-file .env -f infra/docker-compose.yml up -d
pnpm db:migrate
pnpm nx serve api           # http://localhost:3000/api/health
```

The API refuses to start with an incomplete environment and lists everything that is missing. `JWT_SECRET` signs session cookies and must be at least 32 characters.

Then run an app or a test suite through Nx, for example:

```bash
pnpm nx serve web
pnpm nx test shared
pnpm nx test api            # needs the database from the compose stack
```

## Development

```bash
pnpm nx run-many -t lint test build typecheck
pnpm nx format:check
pnpm nx test shared
```

The API's tests are integration tests: they run the real application against the real TimescaleDB, with only the broker replaced by a recording fake, so the compose database has to be up and migrated. CI starts a TimescaleDB service container and runs `pnpm db:migrate` before the checks.

CI (`.github/workflows/ci.yml`) runs `pnpm nx format:check` and `pnpm nx run-many -t lint test build typecheck` on every push to `main` and on every pull request.

## Deployment

The cloud side (database, broker, API, HTTPS) runs on a VPS from `infra/docker-compose.prod.yml`; [docs/deploy.md](docs/deploy.md) has the steps. A merge to `main` deploys itself through GitHub Actions once the checks pass (`infra/prod/deploy.sh`). The Dockerfile for the API is `infra/docker/api.Dockerfile`.

## Security

`SECURITY.md` records what the current setup protects against, what it does not, and which gaps are deliberate. The short version: users and gateways authenticate and every query is scoped to its owner, and the server side serves HTTPS and a TLS broker listener, but the gateway does not use TLS yet, the node-to-gateway hop is plain, and sessions cannot be revoked.

## Status

- `libs/shared` (telemetry contract, MQTT topics, pairing, API contracts) and `libs/db` (Drizzle schema, Timescale hypertable and hourly aggregate) are implemented.
- `apps/api` is implemented: authentication, pairing, MQTT ingest with automatic planter creation, and the read API for gateways, planters, plants and readings. It is covered by unit and integration tests.
- `apps/web` is still an Nx skeleton: no UI beyond the generated starter page.
- The gateway validates and forwards telemetry, and the generated contract artifacts are in place. It does not call `/api/pair` yet, and it does not publish its `online`/`offline` status, so the API only knows a gateway was last seen when it sends telemetry.
- The ESP32 node reads its sensors and publishes telemetry, but it does not pair with the API: its broker credentials are set at flash time. See `firmware/README.md`.
