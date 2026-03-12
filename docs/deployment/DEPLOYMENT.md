# Deployment Guide

Deploy Delirium to a VPS with SSL via nginx + Let's Encrypt.

## Recommended: Automatic CI/CD

Push a git tag → GitHub Actions builds the Docker image → VPS webhook deploys it automatically. See [Auto-deploy (CI/CD)](AUTO_DEPLOYMENT.md) for the full setup.

## First-Time VPS Setup

**Requirements:** Ubuntu 22.04+, a domain pointing at the server.

Run the installer on your VPS — it handles everything: Docker, nginx, SSL, secrets, and the deploy webhook:

```bash
curl -fsSL https://raw.githubusercontent.com/marcusb333/delerium-paste/main/scripts/fresh-vps-install.sh | sudo bash
```

The script will prompt you for your domain and SSL email, then confirm before making any changes. You can also pass them as environment variables for non-interactive use:

```bash
curl -fsSL https://raw.githubusercontent.com/marcusb333/delerium-paste/main/scripts/fresh-vps-install.sh \
  | sudo DOMAIN=paste.example.com SSL_EMAIL=admin@example.com bash
```

After the installer finishes, it prints the `DEPLOY_TOKEN` you need to add to your GitHub Secrets for CI/CD auto-deployment.

To wipe all existing paste data before reinstalling:

```bash
curl -fsSL https://raw.githubusercontent.com/marcusb333/delerium-paste/main/scripts/fresh-vps-install.sh \
  | sudo WIPE_DATA=1 bash
```

## Updates

Tagged releases deploy automatically. For manual updates (e.g. compose file changes):

```bash
# From local machine
scp docker-compose-prod.yml noob@your-vps:/home/noob/delerium-paste/

# On the VPS
docker compose -f docker-compose-prod.yml pull server
docker compose -f docker-compose-prod.yml up -d --force-recreate --no-deps server
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| 502 Bad Gateway | Server container not running: `docker compose -f docker-compose-prod.yml ps` |
| Services unhealthy | `docker compose -f docker-compose-prod.yml logs server` |
| SSL certificate error | Verify DNS: `dig +short your-domain.com` |
| Port conflict on 8080 | `sudo ss -tlnp | grep 8080` — another process on that port |

## Backup

```bash
docker compose -f docker-compose-prod.yml exec -T postgres \
  pg_dump -U delerium delerium | gzip > backups/delerium_$(date +%Y%m%d_%H%M%S).sql.gz
```

## Monitoring (Prometheus + Grafana)

An opt-in monitoring overlay adds Prometheus metrics, Grafana dashboards, and an nginx exporter. The `/metrics` endpoint is internal-only and never proxied externally.

**1. Add to `.env`:**
```bash
GRAFANA_ADMIN_PASSWORD=$(openssl rand -base64 20)
```

**2. Start the overlay:**
```bash
make monitoring-up
# or directly:
docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

**3. Access Grafana at `http://localhost:3000`** — login: `admin` / your password.

The pre-provisioned **Delerium** dashboard shows paste creation/view rates, HTTP latency (p50/p95/p99), JVM heap, rate limit hits, PoW failures, and nginx connections.

**Manage the overlay:**
```bash
make monitoring-status   # show container status
make monitoring-logs     # follow logs
make monitoring-down     # stop (data volumes preserved)
```

Prometheus and the nginx exporter are intentionally not port-mapped. Grafana is the only externally accessible monitoring service (port 3000). Restrict access to port 3000 with your firewall in production.

## More

- [Auto-deploy (CI/CD)](AUTO_DEPLOYMENT.md) - GitHub Actions + webhook deploy
- [Setup Guide](../getting-started/SETUP.md) - Initial configuration
- [SSL Setup](SSL_SETUP.md) - Advanced SSL options
- [Kubernetes](KUBERNETES.md) - Deploy to a Kubernetes cluster
- [Security Checklist](../security/CHECKLIST.md)
