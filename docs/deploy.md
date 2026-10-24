# Deploying to the VPS

One Ubuntu server runs everything the cloud side needs: TimescaleDB, the MQTT broker, the API and Caddy, all from `infra/docker-compose.prod.yml`. The gateway and the nodes stay at home.

```
internet ──443──> Caddy ──> API ──> TimescaleDB
         ──80───> Caddy (certificate renewal, redirect to 443)
         ──8883─> Mosquitto (TLS) <── API (plain 1883, inside the compose network only)
```

Only 80, 443 and 8883 are published. The database and the broker's plain listener are not reachable from outside.

The domain is used for both the web/API (`https://clinio.cz`) and the broker (`mqtts://clinio.cz:8883`). One DNS record, one certificate.

## What you need

- An Ubuntu server with a public IP and root or sudo access.
- A domain whose A record points at the server. Check from your own machine: `dig +short clinio.cz` (or `nslookup clinio.cz`) must print the server's IP. **Do this before the first start**: Caddy asks Let's Encrypt for a certificate as soon as it starts, and Let's Encrypt limits failed attempts.
- Ports 80, 443 and 8883 open, both in `ufw` on the server and in any firewall in the provider's control panel.

## First deploy

On the server.

**1. Firewall**

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443,8883/tcp
sudo ufw allow 443/udp
sudo ufw enable
```

**2. Docker**

Follow the official instructions for Ubuntu: <https://docs.docker.com/engine/install/ubuntu/>. Then let your user run it without `sudo` and log in again:

```bash
sudo usermod -aG docker $USER
```

Check with `docker compose version`.

**3. The code**

```bash
git clone https://github.com/davpu/project_spring.git
cd project_spring
git checkout main   # or the branch you want to run
```

If the repository is private, give the server read access with a deploy key or a token.

**4. Secrets**

```bash
sh infra/prod/init-env.sh clinio.cz
```

This writes `.env.production` with the domain and freshly generated passwords (database, session signing key, broker admin). It is readable by you only and is never committed. **Keep a copy somewhere safe** (a password manager). Losing it is survivable, but the database and broker keep the passwords they were first started with, so the file and the data have to stay together.

**5. Start**

```bash
docker compose --env-file .env.production -f infra/docker-compose.prod.yml up -d --build
```

The first build takes a few minutes. What happens, in order: the database starts, `migrate` applies the migrations and exits, the API starts, Caddy gets the certificate, and the broker waits for that certificate and then starts its TLS listener.

**6. Check**

```bash
docker compose --env-file .env.production -f infra/docker-compose.prod.yml ps
curl https://clinio.cz/api/health
```

The health check should answer `{"status":"ok","db":true,"mqtt":true}`. Then the broker, from any machine:

```bash
openssl s_client -connect clinio.cz:8883 -servername clinio.cz </dev/null 2>&1 | grep -E "subject=|Verify return code"
```

`Verify return code: 0 (ok)` means the certificate is trusted.

The API's log shows one `Connection lost during setup, will retry` warning on the very first start. That is expected: granting itself its read role makes the broker drop the connection once.

**7. Renewal**

Caddy renews the certificate by itself, about a month before it expires. The broker only reads its certificate at startup, so it needs a restart afterwards. This script restarts it when, and only when, the certificate changed. Run it weekly from cron (`crontab -e`):

```
0 4 * * 1 /home/YOUR_USER/project_spring/infra/prod/mqtt-cert-sync.sh >> /home/YOUR_USER/mqtt-cert-sync.log 2>&1
```

Gateways reconnect on their own after the restart.

## Updating

```bash
cd project_spring
git pull
docker compose --env-file .env.production -f infra/docker-compose.prod.yml up -d --build
```

Migrations run automatically before the API starts. Data lives in Docker volumes and survives this.

## What the gateway has to do

These settings are the gateway's (Node-RED), not the server's:

- Pair over HTTPS: `POST https://clinio.cz/api/pair` with the code, see [docs/api.md](api.md).
- Connect to the broker with `mqtts://clinio.cz:8883`, with TLS on and the server certificate verified, using the username and password from the pairing response. The Node-RED flow currently has `usetls: false` and a host and port from the environment; that has to change before it talks to this broker. **Until it does, do not point it at the server**: its password would travel in cleartext.
- The local broker in the house can stay plain; it never leaves the LAN.

## Backups

Nothing is backed up automatically. A manual dump:

```bash
docker compose --env-file .env.production -f infra/docker-compose.prod.yml exec -T db \
  pg_dump -U spring -Fc spring > spring-$(date +%F).dump
```

Copy it off the server. Restore with `pg_restore` into an empty database.

## Troubleshooting

| symptom                                                         | likely cause                                                                                                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `curl https://clinio.cz` fails, Caddy log shows ACME errors     | DNS does not point at the server yet, or port 80 is blocked (the provider's firewall as well as `ufw`). Fix it and `docker compose ... restart caddy`. |
| The broker log keeps printing `Waiting for the TLS certificate` | Caddy has no certificate yet. Same causes as above; check `docker compose ... logs caddy`.                                                             |
| The API container restarts                                      | `docker compose ... logs api`. The environment is validated at startup and every problem is listed.                                                    |
| `/api/health` says `"mqtt": false`                              | The broker is not up or the admin password does not match the one the broker was first started with.                                                   |
| A gateway is refused with `not authorised`                      | Wrong credentials, or the gateway was deleted. Pair again with a new code.                                                                             |

## Dangerous commands

- `docker compose ... down -v` deletes the volumes, which means the database, the broker's clients and the certificates. Plain `down` is safe.
- Changing `POSTGRES_PASSWORD` or `MQTT_ADMIN_PASSWORD` in `.env.production` does **not** change them in the running database or broker; it only breaks the connection. To change one, change it inside the service first.
