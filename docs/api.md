# API reference

For the web app and for whoever builds the gateway's pairing step. The overview is in the [README](../README.md); this page has the details: exact request and response shapes, status codes and examples.

The shapes below are written out by hand from `libs/shared/src/lib/api.ts` and `libs/shared/src/lib/pairing.ts`. If they ever disagree, the code wins. The web app can import the types directly from `@org/shared`.

## Conventions

- Base path `/api`. The examples use `http://localhost:3000`.
- Bodies and responses are JSON. Timestamps are ISO 8601 strings, ids are UUIDs.
- **There is no CORS.** The browser must reach the API on the same origin as the page: in production behind the reverse proxy, in development through a dev-server proxy (`/api` to `localhost:3000`).
- **Sessions:** `POST /auth/register` and `POST /auth/login` set an `HttpOnly` cookie named `session` (7 days). The page cannot read it; it is sent automatically. With `fetch` on the same origin that is the default, across origins you would need `credentials: 'include'`. In production the cookie is `Secure` and `SameSite=Lax`.
- A route marked **session** answers `401` without a valid cookie.
- A resource that belongs to someone else answers `404`, the same as one that does not exist.

### Errors

Every error has a `statusCode` and a `message`. A `400` from validation also lists what was wrong:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "issues": [
    {
      "path": "password",
      "message": "Too small: expected string to have >=8 characters"
    }
  ]
}
```

| status | meaning                                                    |
| ------ | ---------------------------------------------------------- |
| 400    | validation failed, or an invalid / expired pairing code    |
| 401    | no session, or wrong email or password                     |
| 404    | not found, or not yours                                    |
| 409    | email already registered                                   |
| 429    | rate limited (see below) or too many pending pairing codes |
| 502    | the MQTT broker rejected a command                         |
| 503    | the MQTT broker is down or did not answer                  |

Rate limits are per client address: 120 requests per minute in general, 10 per minute on `register` and `login`, 5 per minute on `/pair`.

## Auth

### `POST /auth/register`

```json
{ "email": "me@example.com", "password": "at-least-8-chars" }
```

Email is trimmed and lowercased. Password is 8 to 128 characters with at least one uppercase letter and one digit (`PASSWORD_RULES` in `libs/shared/src/lib/auth.ts`). Returns `201` with `{ "id": "...", "email": "me@example.com" }` and sets the cookie. `409` if the email is taken.

### `POST /auth/login`

Same body (password only has to be non-empty). Returns `200` with the same user object and sets the cookie. `401` with `Invalid email or password` for either mistake.

### `POST /auth/forgot-password`

```json
{ "email": "me@example.com" }
```

Emails a link to reset the password. Always answers `202` with an empty body, whether or not the address has an account, so the form cannot be used to find out who is registered; tell the user to check their inbox either way. The link looks like `https://clinio.cz/reset-password?token=...`, works once and expires after an hour. An account can have at most 3 live links; asking again past that sends nothing. `400` only if the address is not an email address. Limited to 5 requests per minute per client.

### `POST /auth/reset-password`

```json
{ "token": "the token from the link", "password": "New-password-1" }
```

Sets the new password, which has to meet the same rules as at registration. Returns `204` and does **not** sign the user in, so the web app should send them to the login form. `400` with `Invalid or expired reset link` for a link that is wrong, expired or already used (the same message for all three), or a `Validation failed` `400` for a password that breaks the rules; in that case the link is still usable. Using a link also cancels any other open links of that account. Sessions that are already signed in stay signed in.

The web app needs a page at `/reset-password` that reads `token` from the query string, asks for the new password and calls this endpoint.

### `POST /auth/logout`

`204`, clears the cookie. Works without a session.

### `GET /auth/me` (session)

`200` with `{ "id": "...", "email": "..." }`. Use it on page load to find out whether the user is signed in.

## Pairing

The flow: the user creates a code, types it into the gateway, the gateway redeems it, the web app notices.

### `POST /pairing-codes` (session)

```json
{ "gatewayName": "Balkon" }
```

Name is 1 to 80 characters. Returns `201`:

```json
{
  "id": "6f1c...",
  "code": "ABCD-2345",
  "expiresAt": "2026-10-24T12:10:00.000Z"
}
```

Show `code` to the user. It expires after 10 minutes and works once. A user can hold at most 5 unredeemed codes; the sixth gets `429` until one expires.

### `GET /pairing-codes/:id` (session)

Poll this (every second or two) while the code is on screen.

```json
{ "status": "pending" }
{ "status": "redeemed", "gatewayId": "9d2e..." }
{ "status": "expired" }
```

### `POST /pair` (no session, called by the gateway)

```json
{ "code": "ABCD-2345" }
```

The code may be typed in any case, with or without the dash or spaces. Returns `200`:

```json
{
  "gatewayId": "9d2e...",
  "mqtt": {
    "url": "mqtts://mqtt.example.com:8883",
    "username": "9d2e...",
    "password": "..."
  },
  "topics": {
    "telemetry": "gateways/9d2e.../planters/{sensorKey}/telemetry",
    "status": "gateways/9d2e.../status"
  }
}
```

- **The password is returned once and is not stored.** The gateway has to keep it. If it is lost, delete the gateway and pair again.
- `username` is the `gatewayId`.
- Replace `{sensorKey}` in `topics.telemetry` with the planter's key.
- `400 Invalid or expired pairing code` covers every failure on purpose: wrong, expired and already used look the same.
- `502` / `503` mean the broker could not create the gateway. The code is **not** used up, so the gateway can simply retry.

## Gateways (session)

### `GET /gateways`

```json
[
  {
    "id": "9d2e...",
    "name": "Balkon",
    "lastSeenAt": "2026-10-24T12:00:03.120Z",
    "createdAt": "2026-10-20T08:15:00.000Z",
    "planterCount": 2
  }
]
```

`lastSeenAt` is `null` until the first telemetry arrives.

### `DELETE /gateways/:id`

`204`. Revokes the gateway's broker credentials first, then deletes the gateway with all its planters, plants and readings. The gateway's next connection attempt is refused; it has to be paired again with a new code.

## Planters (session)

A planter appears by itself when its gateway first reports a new `sensorKey`, named after the key. Deleting one does not stop that: if the node keeps publishing, it comes back.

### `GET /planters`

All planters of the user's gateways:

```json
[
  {
    "id": "b3a0...",
    "gatewayId": "9d2e...",
    "gatewayName": "Balkon",
    "name": "balcony-1",
    "sensorKey": "balcony-1",
    "createdAt": "2026-10-20T08:20:00.000Z",
    "latest": {
      "airTemperature": { "value": 21.4, "time": "2026-10-24T12:00:03.000Z" },
      "soilHumidity": { "value": 37, "time": "2026-10-24T12:00:03.000Z" }
    }
  }
]
```

`latest` holds the newest value per metric. A metric that was never reported has no key at all, so check before reading it.

### `GET /planters/:id`

The same object plus `"plants": PlantDto[]`.

### `PATCH /planters/:id`

```json
{ "name": "Balkon vlevo" }
```

1 to 80 characters. Returns the updated planter (without `plants`).

### `DELETE /planters/:id`

`204`. Removes the planter with its plants and readings.

## Readings

### `GET /planters/:id/readings` (session)

| query    | required | meaning                                                           |
| -------- | -------- | ----------------------------------------------------------------- |
| `metric` | yes      | `airTemperature`, `airHumidity` or `soilHumidity`                 |
| `from`   | no       | ISO 8601 with an offset, default 24 hours before `to`             |
| `to`     | no       | ISO 8601 with an offset, default now                              |
| `bucket` | no       | `raw`, `hour` or `day`, default chosen from the range (see below) |

```bash
curl -b cookies 'http://localhost:3000/api/planters/b3a0.../readings?metric=airTemperature&from=2026-10-23T00:00:00Z'
```

```json
{
  "metric": "airTemperature",
  "bucket": "hour",
  "from": "2026-10-23T00:00:00.000Z",
  "to": "2026-10-24T12:05:00.000Z",
  "points": [
    {
      "time": "2026-10-23T00:00:00.000Z",
      "avg": 18.2,
      "min": 17.9,
      "max": 18.6,
      "samples": 12
    }
  ]
}
```

- Every point has `avg`, `min`, `max` and `samples`. A `raw` point is a single reading, so the three values are equal and `samples` is 1. You can draw all buckets with the same code.
- Default bucket: `raw` for ranges up to 6 hours, `hour` up to 14 days, `day` beyond.
- `time` is the start of the bucket, in UTC. Days are UTC days. For `hour` and `day`, the first point can start slightly before `from`, because `from` is rounded down to a whole bucket.
- The newest, still-open hour is included, so the chart does not end early.
- Limits, answered with `400` that names the bucket to use instead: `raw` returns at most 10 000 points, `hour` at most 92 days. `from` must be earlier than `to`.
- No data in the range gives an empty `points` array, not an error.

## Plants (session)

A plant belongs to a planter. It is descriptive only; measurements belong to the planter.

```json
{
  "id": "c41d...",
  "planterId": "b3a0...",
  "species": "Basil",
  "lifecycle": "annual",
  "plantedAt": "2026-05-01",
  "createdAt": "2026-10-24T12:00:00.000Z"
}
```

`lifecycle` is `annual`, `biennial` or `perennial`. `plantedAt` is a plain date (`YYYY-MM-DD`) or `null`.

### `POST /planters/:id/plants`

```json
{ "species": "Basil", "lifecycle": "annual", "plantedAt": "2026-05-01" }
```

`species` is 1 to 120 characters, `lifecycle` is required, `plantedAt` is optional and may be `null`. Returns `201` with the plant.

### `PATCH /plants/:id`

Any subset of the same fields. Returns the updated plant.

### `DELETE /plants/:id`

`204`.

## Health

### `GET /health`

No session, not rate limited.

```json
{ "status": "ok", "db": true, "mqtt": true }
```

`status` is `degraded` when either is down. The HTTP status stays `200`, so read the body.

## For the gateway: MQTT

After pairing, the gateway talks MQTT with the credentials from `/pair`. Topics and payload are described in the README under [Telemetry contract](../README.md#telemetry-contract) and [MQTT topics](../README.md#mqtt-topics).

In short:

- Publish telemetry to `gateways/{gatewayId}/planters/{sensorKey}/telemetry`, for example `{ "airTemperature": 20.4, "airHumidity": 30, "soilHumidity": 40 }`. At least one metric is required, unknown keys are rejected, and `ts` is optional.
- Publish `online` to `gateways/{gatewayId}/status`, and set the last will to `offline` on the same topic.
- The broker only allows a gateway to publish under its own `gatewayId`. Publishing elsewhere is refused by the broker, not by the API.
- The broker has no way to say a message was bad: a payload that breaks the contract is dropped by the API and logged. If data does not show up, check the API log.
- If the broker refuses the connection with an authorization error, the gateway was deleted or the password is wrong. It needs a new pairing code; `/pair` does not work with the old credentials.
