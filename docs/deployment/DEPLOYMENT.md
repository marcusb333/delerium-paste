# Deployment Guide

Deploy Delirium locally or to a VPS with SSL.

## Automatic Deployment (Recommended)

When a git tag is pushed, GitHub Actions builds the Docker image and deploys it to the VPS automatically — no manual steps needed. See [Auto-deploy (CI/CD)](AUTO_DEPLOYMENT.md) for setup.

## Manual / First-Time VPS Setup

```bash
./scripts/deploy-prod.sh               # Full deployment (pull latest images)
./scripts/deploy-prod.sh --quick       # Skip backup (fastest)
./scripts/deploy-prod.sh --build       # Build images from source instead of pulling
./scripts/deploy-prod.sh --skip-ssl    # Skip SSL setup
./scripts/deploy-prod.sh --help        # Full help
```

**Requirements:** Docker, Docker Compose. For VPS: Ubuntu 22.04+, domain pointed to server, 1GB RAM.

## VPS Setup

The VPS does not need git. Copy the two files it needs from your local machine:

```bash
scp docker-compose-prod.yml noob@your-vps:/home/noob/delerium-paste/
scp scripts/vps-setup.sh noob@your-vps:/tmp/
scp scripts/nginx-snippet.conf noob@your-vps:/tmp/
```

Then on the VPS:

```bash
mkdir -p /home/noob/delerium-paste
cd /home/noob/delerium-paste

# Create secrets (never commit this file)
cat > .env <<EOF
DELETION_TOKEN_PEPPER=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)
DB_PASSWORD=<same as POSTGRES_PASSWORD>
EOF

# Pull image and start services
IMAGE_TAG=latest docker compose -f docker-compose-prod.yml up -d

# Set up webhook for auto-deploy (see AUTO_DEPLOYMENT.md)
export DEPLOY_TOKEN="your-deploy-token"
sudo -E bash /tmp/vps-setup.sh
```

## Manual Deployment

### 1. Prerequisites

- Ubuntu 22.04+ or Debian 11+
- Docker: `curl -fsSL https://get.docker.com | sudo sh`

### 2. Configure

Copy `docker-compose-prod.yml` to the VPS (e.g. via `scp`), then create `.env`:

```bash
cat > .env <<EOF
DELETION_TOKEN_PEPPER=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)
DB_PASSWORD=<same as POSTGRES_PASSWORD>
EOF
```

### 3. Deploy

```bash
IMAGE_TAG=latest docker compose -f docker-compose-prod.yml up -d
```

## SSL

- **Let's Encrypt:** Set `DOMAIN` and `SSL_EMAIL` in `.env` before running `./scripts/deploy-prod.sh`.
- **Manual:** See [SSL_SETUP.md](SSL_SETUP.md).
- **Self-signed (dev only):** `mkdir -p ssl && openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout ssl/privkey.pem -out ssl/fullchain.pem -subj "/CN=localhost"`

## Updates

Tagged releases deploy automatically via GitHub Actions + VPS webhook. For manual updates (e.g. config changes without a new release), `scp` the updated `docker-compose-prod.yml` to the VPS, then:

```bash
docker compose -f docker-compose-prod.yml pull server
docker compose -f docker-compose-prod.yml up -d --force-recreate --no-deps server
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Services unhealthy | `docker compose -f docker-compose-prod.yml logs server` |
| SSL failed | Verify DNS: `dig +short your-domain.com` |
| Port conflict | `sudo ss -tlnp | grep -E ":(80|443|8080)"` |

## Backup

```bash
docker compose -f docker-compose-prod.yml exec -T postgres \
  pg_dump -U delerium delerium | gzip > backups/delerium_$(date +%Y%m%d_%H%M%S).sql.gz
```

## More

- [Setup Guide](../getting-started/SETUP.md) - Initial configuration
- [Auto-deploy (CI/CD)](AUTO_DEPLOYMENT.md) - GitHub Actions + webhook deploy
- [Kubernetes](KUBERNETES.md) - Deploy to a Kubernetes cluster
- [SSL Setup](SSL_SETUP.md) - Advanced SSL
- [Security Checklist](../security/CHECKLIST.md)
