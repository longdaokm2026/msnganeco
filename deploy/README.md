# Production deployment

This directory contains the release script used by the `Deploy production`
GitHub Actions workflow. Production runs the web and API containers on the
Ubuntu application server; PostgreSQL remains external.

## 1. Prepare the application server once

Install Docker Engine and the Docker Compose plugin from Docker's official
Ubuntu repository. Then create a non-root deployment user and directory:

```bash
sudo usermod -aG docker deploy
sudo install -d -o deploy -g deploy -m 750 /opt/msngan
```

Log out and back in so the Docker group membership takes effect.

Copy `.env.production.example` to `/opt/msngan/.env.production`, replace every
placeholder, then protect it:

```bash
chmod 600 /opt/msngan/.env.production
```

The database host must accept connections from the application server over a
private network or TLS. Never expose PostgreSQL port 5432 to the public
Internet.

## 2. Allow the server to pull private GHCR images

Create a GitHub token with `read:packages` permission and log in once as the
`deploy` user:

```bash
docker login ghcr.io -u YOUR_GITHUB_USERNAME
```

Paste the token when Docker requests a password. Do not store the token in the
repository or `.env.production`.

## 3. Configure DNS

Point both production records at the application server public IP:

```text
app.example.com  A  APP_SERVER_IP
api.example.com  A  APP_SERVER_IP
```

Set the same hosts in `.env.production`. Ports 80 and 443 must be reachable so
Caddy can obtain and renew TLS certificates.

## 4. Configure GitHub

Create a GitHub Environment named `production`. Add these repository secrets:

- `PROD_HOST`: application server hostname or IP.
- `PROD_USER`: normally `deploy`.
- `PROD_SSH_KEY`: private key dedicated to GitHub Actions deployment.
- `PROD_SSH_KNOWN_HOSTS`: verified SSH host-key line for the server.

Add this repository variable:

- `PROD_API_URL`: public API origin, for example `https://api.example.com`.

Install the matching deployment public key in
`/home/deploy/.ssh/authorized_keys` on the server. Generate the known-hosts
entry from a trusted machine and verify its fingerprint before saving it:

```bash
ssh-keyscan -H APP_SERVER_IP
```

For the first releases, configure the `production` Environment with required
reviewers. This keeps deployment manual even if another workflow triggers it.

## 5. Deploy

Open GitHub Actions, select `Deploy production`, and choose **Run workflow** on
`main`. The workflow will:

1. run build, database, API, type and lint checks;
2. publish immutable Web/API images tagged with the Git commit SHA;
3. copy only the Compose, Caddy and release-script files to `/opt/msngan`;
4. run Prisma migrations;
5. start the release and verify Web/API health;
6. restore the prior application images if health checks fail.

Database migrations are not automatically reversed. Keep migrations backward
compatible and back up the database before high-risk schema changes.

## Operations

Run these commands on the application server:

```bash
cd /opt/msngan
docker compose --env-file .env.production -f compose.prod.yaml ps
docker compose --env-file .env.production -f compose.prod.yaml logs --tail=200 api
docker compose --env-file .env.production -f compose.prod.yaml logs --tail=200 web
docker compose --env-file .env.production -f compose.prod.yaml logs --tail=200 caddy
```

The last healthy Git SHA is stored in `/opt/msngan/.release`.
