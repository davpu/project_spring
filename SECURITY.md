# Security posture and known vulnerabilities

What this system currently protects against, what it does not, and which gaps are deliberate. Written against the state of the repo, not against intentions: anything described as missing is missing in the code.

The threat model is a home LAN. Everything runs and is demonstrated from one apartment, and nothing crosses the internet yet.

## What is in place

- The MQTT broker runs with `allow_anonymous false` and the dynamic-security plugin, so every client authenticates. There is no open broker.
- Each participant has its own broker client: the API, the gateway, and the node.
- The gateway validates every telemetry body against the generated JSON Schema before forwarding it, so malformed or out-of-range data does not reach the server.
- The Node-RED editor is bound to `127.0.0.1` only, so it is not reachable from the LAN.
- Credentials are kept out of version control. `firmware/include/config.h`, `.env` and `firmware/.pio` are all gitignored.

## What the gateway does and does not do

The gateway validates **shape**, not **origin**. It has no way to tell whether a message claiming `planters/balcony-1` actually came from the node that owns that key.

So the gateway protects the server from bad data. It does not authenticate nodes, and it does not make the node-to-gateway hop confidential. Those have to be solved on that hop; the gateway cannot fix them after the fact.

## Known vulnerabilities

### 1. No TLS on any hop

`infra/mosquitto/mosquitto.conf` has `listener 1883` with no TLS, and the gateway's broker connection has `usetls: false`. MQTT credentials travel in the CONNECT packet in cleartext, so anyone on the same WiFi can capture them and then publish as the node or the gateway.

The config file already states the intent (`In production the listener is TLS (8883)`), but nothing implements it.

**Accepted for now**, because all traffic stays on the home LAN. This becomes the single most important gap the moment the gateway talks to a broker outside the house: that hop must not ship without TLS.

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

### 6. No authorisation on the server side yet

`apps/api` is still a skeleton: there is no MQTT ingest, no authentication, and no check that a gateway may write to the planter it claims. The database already models users, gateways and planters, so the ownership check has somewhere to live, but nothing enforces it.

**Not accepted.** This has to exist before the API is exposed to anything.

### 7. Pairing is designed but not implemented

`libs/shared/src/lib/pairing.ts` defines the flow: short-lived codes from a safe alphabet, a 10 minute TTL, and credentials handed to the gateway over HTTPS. No endpoint implements it, so the gateway's identity and credentials are configured by hand and the node's are flashed in.

Until it exists, there is no credential rotation and no revocation: a leaked password is fixed by editing config and reflashing.

## If this were to leave the LAN

In order of importance:

1. TLS on the hop that leaves the house, with the gateway verifying the broker's certificate.
2. Server-side authorisation: an authenticated gateway may only write to planters it owns.
3. Per-node credentials scoped to one topic, issued by pairing rather than flashed.
4. Rate limiting on the pairing endpoint, which `libs/shared` already anticipates.
