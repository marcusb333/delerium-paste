# Deployment Guide

Deploy Delirium locally or to a VPS with SSL.

## Quick Deploy

```bash
./deploy.sh local                              # Local dev (http://localhost:8080)
./deploy.sh vps-setup example.com admin@example.com  # VPS + SSL
./deploy.sh production                         # Production (existing setup)
./deploy.sh update                             # Pull + rebuild + restart
./deploy.sh status                             # Check status
./deploy.sh logs                               # View logs
./deploy.sh stop                               # Stop services
./deploy.sh help                               # Full help
```

**Requirements:** Docker, Docker Compose. For VPS: Ubuntu 22.04+, domain pointed to server, 1GB RAM.

## VPS Setup

```bash
ssh user@your-vps
git clone https://github.com/your-username/delerium-paste.git
cd delerium-paste
./deploy.sh vps-setup your-domain.com your@email.com
```

This installs Docker, configures SSL (Let's Encrypt), and deploys. Access at `https://your-domain.com`.

## Manual Deployment

### 1. Prerequisites

- Ubuntu 22.04+ or Debian 11+
- Docker: `curl -fsSL https://get.docker.com | sudo sh`
- Node.js 20: see [NodeSource](https://github.com/nodesource/distributions)

### 2. Configure

```bash
cp .env.example .env
echo "DELETION_TOKEN_PEPPER=$(openssl rand -hex 32)" >> .env
echo "DOMAIN=your-domain.com" >> .env
echo "LETSENCRYPT_EMAIL=your@email.com" >> .env
```

### 3. Deploy

```bash
./deploy.sh production
```

Or manually: `cd client && npm run build && cd .. && docker compose -f docker-compose.prod.yml up -d`

## SSL

- **Let's Encrypt:** `./deploy.sh vps-setup` handles this automatically.
- **Manual:** See [SSL_SETUP.md](SSL_SETUP.md).
- **Self-signed (dev only):** `mkdir -p ssl && openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout ssl/privkey.pem -out ssl/fullchain.pem -subj "/CN=localhost"`

## Updates

```bash
git pull
./deploy.sh production
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Services unhealthy | `./deploy.sh logs` then `./deploy.sh stop && ./deploy.sh production` |
| SSL failed | Verify DNS: `dig +short your-domain.com` |
| Port conflict | `sudo ss -tlnp | grep -E ":(80|443|8080)"` |

## Backup

```bash
docker run --rm -v delirium_server-data:/data -v $(pwd)/backups:/backup \
  alpine tar czf /backup/server-data-$(date +%Y%m%d-%H%M%S).tar.gz /data
```

## More

- [Setup Guide](../getting-started/SETUP.md) - Initial configuration
- [Kubernetes](KUBERNETES.md) - Deploy to a Kubernetes cluster
- [SSL Setup](SSL_SETUP.md) - Advanced SSL
- [Security Checklist](../security/CHECKLIST.md)
- [Auto-deploy (CI/CD)](AUTO_DEPLOYMENT.md)
