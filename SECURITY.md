# Security posture and known vulnerabilities

What this system currently protects against, what it does not, and which gaps are deliberate. Written against the state of the repo, not against intentions: anything described as missing is missing in the code.

The threat model started as a home LAN. The server side is now meant to run on a public VPS (see [docs/deploy.md](docs/deploy.md)), so the hop from the gateway to the cloud crosses the internet; the node-to-gateway hop stays inside the house.

## What is in place

- The MQTT broker runs with `allow_anonymous false` and the dynamic-security plugin, so every client authenticates. There is no open broker.
- Each participant has its own broker client: the API, the gateway, and the node.
- The gateway validates every telemetry body against the generated JSON Schema before forwarding it, so malformed or out-of-range data does not reach the server.
- The Node-RED editor is bound to `127.0.0.1` only, so it is not reachable from the LAN.
- Credentials are kept out of version control. `firmware/include/config.h`, `.env` and `firmware/.pio` are all gitignored.
- The API authenticates users with a signed, `HttpOnly`, `SameSite=Lax` session cookie, hashes passwords with scrypt, and answers "no such user" and "wrong password" identically.
- Every planter, plant and reading query is scoped to the signed-in user, and someone else's id answers 404, the same as an id that does not exist.
- A paired gateway's broker client can publish only under `gateways/<its own id>/`, so the topic an ingested message arrives on can be trusted as that gateway's.
- Pairing codes are single-use (claimed by one conditional `UPDATE`), expire after 10 minutes, are stored only as a hash, and `/api/pair` and the login routes are rate limited.

## What the gateway does and does not do

The gateway validates **shape**, not **origin**. It has no way to tell whether a message claiming `planters/balcony-1` actually came from the node that owns that key.

So the gateway protects the server from bad data. It does not authenticate nodes, and it does not make the node-to-gateway hop confidential. Those have to be solved on that hop; the gateway cannot fix them after the fact.

## Known vulnerabilities

### 1. No TLS inside the house, and the gateway does not use it to the cloud yet

**On the server this is done:** `infra/docker-compose.prod.yml` puts the API behind Caddy (HTTPS with a Let's Encrypt certificate) and gives the broker a TLS listener on 8883 using the same certificate. The broker's plain listener on 1883 is not published; only the API reaches it, inside the compose network.

What is still open:

- `infra/mosquitto/mosquitto.conf` (the development broker, also the gateway's local broker) has `listener 1883` with no TLS, and the node's connection is plain. MQTT credentials travel in the CONNECT packet in cleartext, so anyone on the same WiFi can capture them and then publish as the node.
- **The gateway's own connection to the cloud broker has `usetls: false`** in the Node-RED flow, so it cannot connect to the public broker at all until that is switched on and the host name is set to the domain. Until then the gateway must not be pointed at the VPS: its password would cross the internet in cleartext.
- The public broker's port 8883 is open to everyone. Without credentials nobody can connect (`allow_anonymous false`), but the port is reachable and the broker is exposed to whatever vulnerabilities it has.

**Accepted for the node-to-gateway hop**, because that traffic stays on the home LAN.

### 2. A node can publish as any planter

The node's broker role allows `publishClientSend` on `planters/#`, not on its own `planters/<sensorKey>/telemetry`. Any node holding node credentials can forge readings for any other planter.

The same credentials are also flashed into every node, so compromising one node compromises all of them.

**Not accepted, just not done yet.** The fix is per-node credentials with an ACL scoped to that node's own topic, which is what pairing already does for gateways. Cheap to do.

### 3. The node's broker role is wider than a node needs

**Fixed.** The node role briefly also allowed `subscribePattern` and `publishClientReceive` on `gateways/#`, granted so one client could double as a test subscriber. It is now `publishClientSend` on `planters/#` and nothing else, and a separate `debug-dev` client exists for watching topics.

### 4. Credentials are readable from a node's flash

The WiFi password and the MQTT password are compiled into the firmware. `strings` on `firmware/.pio/build/esp32dev/firmware.bin` finds them, and `esptool read_flash` recovers them from a board. Flash encryption and secure boot are not enabled.

**Accepted deliberately.** Physical access to a node means someone is already inside the home, which is a bigger problem than the WiFi password. Enabling flash encryption on a school project is not worth the cost in bricked boards.

Worth knowing anyway: if a node ever leaves the house or is handed to someone, treat the WiFi password as disclosed. A separate IoT SSID would limit the blast radius.

### 5. Development passwords are committed

`node-dev-password` appears in `firmware/README.md` and `gateway-dev-password` in `.env.example`, alongside the pre-existing `api-dev-password`. These are real working credentials for a default local setup.

**Accepted** as development defaults, consistent with how the repo already treats the API's broker password. They must not be reused for anything reachable from outside the LAN.

### 6. Server-side authorisation is in place, with known limits

**Mostly fixed.** The API has authentication and per-user ownership checks, and ingest accepts a message only for a gateway that exists. What it still does not do:

- **Sessions cannot be revoked.** The cookie is a stateless JWT valid for 7 days. Logging out clears the cookie in that browser, but a copy of it stays valid until it expires, and deleting a user does not invalidate it. Fixing this needs server-side sessions or a token-version column. **This includes a password reset:** someone who had stolen a session stays signed in after the owner resets the password, until the cookie expires.
- **Password reset links are only as safe as the mailbox.** The link is 256 random bits, stored only as a hash, valid for an hour and good once, and asking for one returns the same answer for every address. But anyone who can read the account's email can take the account over, and registration still answers `409` for an address that is taken, which tells anyone which addresses are registered. The link carries its token in the query string, so the page it opens should not load third-party resources.
- **The mail account's password is on the server** (`SMTP_PASSWORD` in `.env.production`). It should belong to a mailbox made only for sending, not to a personal one. Without `SMTP_HOST` the API cannot send reset emails; in production it then logs an error, never the link.
- **Registration is open and unverified.** Anyone who can reach the API can create an account, and the email is not confirmed.
- **There is no CSRF token.** The defence is `SameSite=Lax` plus the fact that every state-changing route takes JSON. That holds for current browsers; it is not defence in depth.
- **The `Secure` flag is only set when `NODE_ENV=production`.** Over plain HTTP in development the cookie travels in cleartext, like everything else on this LAN-only setup (see 1).
- **Rate limiting is per process and per IP,** kept in memory. It resets on restart and is not shared between instances. Behind a reverse proxy it only works if the proxy sets `X-Forwarded-For`, which production mode trusts from exactly one hop.
- **The API's own broker client is powerful.** It is the dynamic-security admin, which can create, change and delete any client or ACL on the broker, and it also holds a read role for telemetry. Anyone who obtains `MQTT_ADMIN_PASSWORD` controls the broker. Splitting it into an admin used only for provisioning and a read-only ingest client would limit that.
- **A node's telemetry is attributed to its gateway, not to the node.** See 2.

### 7. Pairing is implemented on the server, not yet used by the gateway

`POST /api/pairing-codes` creates a code, `GET /api/pairing-codes/:id` reports its status, and `POST /api/pair` redeems it into a gateway with its own broker client. Deleting a gateway (`DELETE /api/gateways/:id`) revokes that client, and the broker credential is revoked before the database row is removed so a failure cannot leave an untracked credential behind.

What is still open:

- The Node-RED flow does not call `/api/pair` yet, so the gateway's identity and credentials in `.env` are still set by hand.
- Nodes are not paired at all: their credentials are flashed (see 2 and 4).
- There is no rotation. A leaked gateway password is fixed by deleting the gateway and pairing again, which also removes its planters and readings.
- The redemption response carries the broker password, so `/api/pair` must only be served over HTTPS once it leaves the LAN (see 1). The code space is about 39 bits, which is what the rate limit on that route is protecting.

## If this were to leave the LAN

In order of importance:

1. TLS on every hop that leaves the house. The server side exists (HTTPS for the API and `/api/pair`, a TLS MQTT listener); what is left is the gateway calling them over TLS and verifying the broker's certificate.
2. Per-node credentials scoped to one topic, issued by pairing rather than flashed.
3. Server-side sessions, so a stolen cookie can be revoked.
4. Splitting the API's broker client into a provisioning admin and a read-only ingest client.
5. Having the gateway pair through `/api/pair` instead of hand-set credentials.
