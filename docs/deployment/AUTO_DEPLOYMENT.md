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

### 2. VPS Setup (webhook + .env + nginx)

Copy the required files from your local machine:

```bash
scp scripts/vps-setup.sh scripts/nginx-snippet.conf noob@your-vps:/tmp/
scp docker-compose-prod.yml noob@your-vps:/home/noob/delerium-paste/
```

Run the setup script on the VPS as root — it installs `webhook`, generates `.env` with random secrets, configures the systemd service, and prints next steps:

```bash
export DEPLOY_TOKEN="your-deploy-token-here"   # must match the GitHub secret above
sudo -E bash /tmp/vps-setup.sh
```

#### SSL with nginx

`scripts/nginx-snippet.conf` is a complete server block template. Install it and get a certificate:

```bash
sudo cp /tmp/nginx-snippet.conf /etc/nginx/sites-available/delerium
sudo ln -s /etc/nginx/sites-available/delerium /etc/nginx/sites-enabled/
# Edit the file and replace 'your-domain.com' with your actual domain
sudo nano /etc/nginx/sites-available/delerium

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
sudo systemctl reload nginx
```

The template proxies `/` to the server on `127.0.0.1:8080` and `/hooks/` to the webhook on `127.0.0.1:9000`.

### 3. Start Services

```bash
cd /home/noob/delerium-paste
IMAGE_TAG=latest docker compose -f docker-compose-prod.yml up -d
```

After this, all future deploys are fully automatic.

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
| Deploy job: connection refused | nginx not configured, or `systemctl status webhook` shows it's not running |
| Container exits immediately | `docker compose -f docker-compose-prod.yml logs server` — check `.env` values |
| 502 Bad Gateway | Server container not running; check `docker compose -f docker-compose-prod.yml ps` |

## Disabling Auto-Deployment

Rename or delete the workflow file:

```bash
git mv .github/workflows/deploy.yml .github/workflows/deploy.yml.disabled
git commit -m "chore: disable auto-deploy" && git push
```
