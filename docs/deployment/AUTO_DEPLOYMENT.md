# Automatic Deployment (CI/CD)

Every git tag matching `v*` triggers the full pipeline automatically via GitHub Actions.

## How It Works

```
git tag v1.2.3 && git push origin v1.2.3
        │
        ▼
GitHub Actions: .github/workflows/deploy.yml
        │
        ├── Job: build-and-push
        │     ├── Build server Docker image (./server/Dockerfile)
        │     └── Push to Docker Hub
        │           ├── marcusb333/delerium-server:v1.2.3
        │           └── marcusb333/delerium-server:latest
        │
        └── Job: deploy  (runs after build-and-push)
              └── POST https://<VPS_HOST>/hooks/deploy
                    └── VPS webhook pulls new image + recreates server container
```

No SSH access, no manual docker push, no code pull on VPS. The VPS only ever pulls pre-built images from Docker Hub.

## One-Time Setup

### 1. GitHub Secrets

Go to **Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|---|---|
| `DOCKER_USERNAME` | `marcusb333` |
| `DOCKER_TOKEN` | Docker Hub access token (not your password) |
| `VPS_HOST` | Your VPS domain or IP |
| `DEPLOY_TOKEN` | A strong random secret (must match what you set on the VPS) |

Generate `DEPLOY_TOKEN` with: `openssl rand -hex 32`

### 2. VPS Webhook Listener

Run the setup script once on the VPS as root:

```bash
# Set the deploy token before running (must match the GitHub secret above)
export DEPLOY_TOKEN="your-deploy-token-here"
sudo -E bash scripts/vps-setup.sh
```

This installs and starts `webhook` as a systemd service on port 9000, and creates `/opt/deploy.sh`.

### 3. Nginx Proxy

Add the contents of `scripts/nginx-snippet.conf` to your existing nginx `server {}` block, then reload:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

This proxies `https://your-domain.com/hooks/` to the webhook listener on port 9000.

### 4. VPS `.env` File

On the VPS at `/home/noob/delerium-paste/.env` (copy from `.env.example`):

```bash
DELETION_TOKEN_PEPPER=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)
DB_PASSWORD=<same as POSTGRES_PASSWORD>
```

## Triggering a Deployment

Deployments happen automatically when `scripts/release.sh` pushes a tag (Phase 3):

```bash
./scripts/release.sh --patch   # or --minor / --major
```

To deploy a specific tag manually without a full release:

```bash
git tag v1.2.3
git push origin v1.2.3
```

## What Runs on the VPS

The webhook calls `/opt/deploy.sh` with the tag as argument:

```bash
export IMAGE_TAG="v1.2.3"
docker compose -f docker-compose-prod.yml pull server
docker compose -f docker-compose-prod.yml up -d --force-recreate --no-deps server
docker image prune -f
```

Only the `server` container is restarted. `postgres` is never touched.

## Monitoring

- **GitHub Actions run**: Actions tab → `Build and Deploy` workflow
- **VPS webhook logs**: `sudo journalctl -u webhook -f`
- **Server container logs**: `docker compose -f docker-compose-prod.yml logs -f server`

## Troubleshooting

| Symptom | Check |
|---|---|
| Build job fails | Verify `DOCKER_USERNAME` / `DOCKER_TOKEN` secrets are set correctly |
| Deploy job returns 403 | `DEPLOY_TOKEN` secret doesn't match the token in `/opt/hooks/hooks.json` on VPS |
| Deploy job: connection refused | nginx `/hooks/` proxy not configured, or `systemctl status webhook` shows it's not running |
| Container exits immediately | `docker compose -f docker-compose-prod.yml logs server` — likely missing values in `.env` |

## Disabling Auto-Deployment

Rename or delete the workflow file:

```bash
git mv .github/workflows/deploy.yml .github/workflows/deploy.yml.disabled
git commit -m "chore: disable auto-deploy" && git push
```
