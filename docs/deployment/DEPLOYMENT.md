# Deployment Guide

Deploy Delirium locally or to a VPS with SSL.

## Quick Deploy

```bash
./scripts/deploy-prod.sh               # Full deployment (pull latest images)
./scripts/deploy-prod.sh --quick       # Skip backup (fastest)
./scripts/deploy-prod.sh --build       # Build images from source instead of pulling
./scripts/deploy-prod.sh --skip-ssl    # Skip SSL setup
./scripts/deploy-prod.sh --help        # Full help
```

**Requirements:** Docker, Docker Compose. For VPS: Ubuntu 22.04+, domain pointed to server, 1GB RAM.

## VPS Setup

```bash
ssh user@your-vps
git clone https://github.com/marcusb333/delerium-paste.git
cd delerium-paste
# Optional: configure domain + SSL before deploying
echo "DOMAIN=your-domain.com" >> .env
echo "SSL_EMAIL=your@email.com" >> .env
./scripts/deploy-prod.sh
```

This installs Docker if missing, generates secure secrets, configures SSL (Let's Encrypt) if a domain is set, and starts everything. Access at `https://your-domain.com`.

## Manual Deployment

### 1. Prerequisites

- Ubuntu 22.04+ or Debian 11+
- Docker: `curl -fsSL https://get.docker.com | sudo sh`

### 2. Configure

```bash
cp .env.example .env
echo "DELETION_TOKEN_PEPPER=$(openssl rand -hex 32)" >> .env
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)" >> .env
echo "DOMAIN=your-domain.com" >> .env
echo "SSL_EMAIL=your@email.com" >> .env
```

### 3. Deploy

```bash
./scripts/deploy-prod.sh
```

Or manually: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`

## SSL

- **Let's Encrypt:** Set `DOMAIN` and `SSL_EMAIL` in `.env` before running `./scripts/deploy-prod.sh`.
- **Manual:** See [SSL_SETUP.md](SSL_SETUP.md).
- **Self-signed (dev only):** `mkdir -p ssl && openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout ssl/privkey.pem -out ssl/fullchain.pem -subj "/CN=localhost"`

## Updates

```bash
git pull
./scripts/deploy-prod.sh --quick
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Services unhealthy | `make prod-logs` then `make prod-stop && ./scripts/deploy-prod.sh` |
| SSL failed | Verify DNS: `dig +short your-domain.com` |
| Port conflict | `sudo ss -tlnp | grep -E ":(80|443|8080)"` |

## Backup

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U delerium delerium | gzip > backups/delerium_$(date +%Y%m%d_%H%M%S).sql.gz
```

## More

- [Setup Guide](../getting-started/SETUP.md) - Initial configuration
- [Kubernetes](KUBERNETES.md) - Deploy to a Kubernetes cluster
- [SSL Setup](SSL_SETUP.md) - Advanced SSL
- [Security Checklist](../security/CHECKLIST.md)
- [Auto-deploy (CI/CD)](AUTO_DEPLOYMENT.md)
