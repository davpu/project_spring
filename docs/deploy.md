# Deploying to the VPS

One Ubuntu server runs everything the cloud side needs: TimescaleDB, the MQTT broker, the API and Caddy, all from `infra/docker-compose.prod.yml`. The gateway and the nodes stay at home.

```
internet ──443──> Caddy ──> web app (static files)
                       └──> /api ──> API ──> TimescaleDB
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
0 4 * * 1 sh /root/project_spring/infra/prod/mqtt-cert-sync.sh >> /root/mqtt-cert-sync.log 2>&1
```

Use your own home directory in the paths. The `sh` in front matters: it works whether or not the file has the execute bit.

Gateways reconnect on their own after the restart.

## Updating

Normally nothing to do: a merge to `main` deploys itself, see [Automatic deployment](#automatic-deployment). By hand, on the server:

```bash
cd project_spring
SSH_ORIGINAL_COMMAND=$(git rev-parse origin/main) sh infra/prod/deploy.sh
```

(after a `git fetch`). That is the same script CI runs. It builds, applies the migrations, starts the new version and waits for `/api/health`. Data lives in Docker volumes and survives this.

## Automatic deployment

`.github/workflows/ci.yml` has a `deploy` job. For a push to `main` it runs after the checks have passed on that commit, connects to the server over SSH and runs `infra/prod/deploy.sh` with the commit's sha. The script fetches `main`, refuses any sha that is not on it, fast-forwards to it, builds, runs the migrations, starts the new containers, and fails the job if `/api/health` does not report `ok` within 90 seconds. Two merges in a row deploy one after the other. A failed deploy can be retried from the Actions tab (**Run workflow** on `main`).

A failed deploy does **not** roll back. The server keeps whatever it managed to start; fix forward with a new merge, or check out an earlier commit by hand and run the script.

**One-time setup**

1. On the server, create a key that can do nothing except start the deploy script. The `command=` option makes the server run that script whatever the client asks for, and `restrict` turns off everything else (shell, port forwarding, agent forwarding):

   ```bash
   install -m 700 -d ~/.ssh
   ssh-keygen -t ed25519 -N '' -C github-actions-deploy -f ~/gh-deploy
   printf 'command="sh /root/project_spring/infra/prod/deploy.sh",restrict %s\n' "$(cat ~/gh-deploy.pub)" >> ~/.ssh/authorized_keys
   cat ~/gh-deploy        # the private key: copy all of it, including the BEGIN and END lines
   ```

   Adjust the path to where the repository is. After you have put the private key into GitHub (step 3), delete it from the server: `shred -u ~/gh-deploy ~/gh-deploy.pub`.

2. Still on the server, print the line that lets GitHub recognise the server, so that it refuses to talk to an impostor:

   ```bash
   echo "SERVER_IP $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"
   ```

   Replace `SERVER_IP` with the address you will put in `DEPLOY_HOST`.

3. In the GitHub repository: **Settings, Environments, New environment**, name it `production`. In it, add these secrets (secrets of the environment, not of the repository):

   | secret               | value                                      |
   | -------------------- | ------------------------------------------ |
   | `DEPLOY_HOST`        | the server's IP address                    |
   | `DEPLOY_USER`        | the user the key was added to, e.g. `root` |
   | `DEPLOY_SSH_KEY`     | the whole private key from step 1          |
   | `DEPLOY_KNOWN_HOSTS` | the line from step 2                       |

   On the same page you can add **Required reviewers**, which makes every deploy wait for someone to click approve. It is optional; for a school project it is probably too much.

4. Test it: **Actions, CI, Run workflow** on `main`. The `deploy` job should finish green and the log ends with `==> Deployed <sha>`.

**What this trusts.** Anyone who can merge to `main` can run code on the server, because the deploy builds whatever is there. That is inherent to deploying on merge, so keep `main` protected (pull requests only) as it is now. The key itself can only start the deploy script, and the script only deploys commits that are on `main`, so a leaked key cannot be used to run anything else or to deploy a different branch.

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

The `pg_dump: warning: there are circular foreign-key constraints on this table: continuous_agg` it prints is normal for TimescaleDB and harmless. Copy the file off the server.

**Restoring.** A plain `pg_restore` fails on a TimescaleDB dump (`ONLY option not supported on hypertable operations`); the restore has to be bracketed by two Timescale functions. Into a new, empty database on the same server (the TimescaleDB version has to match the one that made the dump):

```bash
C="docker compose --env-file .env.production -f infra/docker-compose.prod.yml"
$C exec -T db psql -U spring -d postgres -c "create database spring_restore"
$C exec -T db psql -U spring -d spring_restore -c "create extension if not exists timescaledb" -c "select timescaledb_pre_restore()"
$C exec -T db pg_restore -U spring -d spring_restore < spring-2026-10-25.dump
$C exec -T db psql -U spring -d spring_restore -c "select timescaledb_post_restore()"
```

This was tried against a database with data: all rows came back, and the hypertable and the hourly aggregate worked. To make the restored copy the live one, stop the API (`$C stop api`), rename the databases (`alter database spring rename to spring_old`, then `alter database spring_restore rename to spring`), and start the API again.

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
