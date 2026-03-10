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

## More

- [Auto-deploy (CI/CD)](AUTO_DEPLOYMENT.md) - GitHub Actions + webhook deploy
- [Setup Guide](../getting-started/SETUP.md) - Initial configuration
- [SSL Setup](SSL_SETUP.md) - Advanced SSL options
- [Kubernetes](KUBERNETES.md) - Deploy to a Kubernetes cluster
- [Security Checklist](../security/CHECKLIST.md)
