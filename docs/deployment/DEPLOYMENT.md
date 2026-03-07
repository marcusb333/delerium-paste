# Deployment Guide

Deploy Delirium to a VPS with SSL via nginx + Let's Encrypt.

## Recommended: Automatic CI/CD

Push a git tag → GitHub Actions builds the Docker image → VPS webhook deploys it automatically. See [Auto-deploy (CI/CD)](AUTO_DEPLOYMENT.md) for the full setup.

## First-Time VPS Setup

**Requirements:** Ubuntu 22.04+, Docker, nginx, a domain pointing at the server.

Install Docker if not already present:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker noob
```

Copy the required files from your local machine:

```bash
scp docker-compose-prod.yml scripts/vps-setup.sh scripts/nginx-snippet.conf \
    noob@your-vps:/tmp/
```

Run setup on the VPS — this generates `.env` with random secrets, installs the webhook listener, and prints next steps:

```bash
export DEPLOY_TOKEN="$(openssl rand -hex 32)"   # save this; add to GitHub Secrets too
sudo -E bash /tmp/vps-setup.sh
```

Move the compose file and start services:

```bash
mv /tmp/docker-compose-prod.yml /home/noob/delerium-paste/
cd /home/noob/delerium-paste
IMAGE_TAG=latest docker compose -f docker-compose-prod.yml up -d
```

## SSL

The server binds to `127.0.0.1:8080` only — nginx handles SSL termination.

`scripts/nginx-snippet.conf` is a complete nginx server block template. Install it:

```bash
sudo cp /tmp/nginx-snippet.conf /etc/nginx/sites-available/delerium
sudo ln -s /etc/nginx/sites-available/delerium /etc/nginx/sites-enabled/
sudo nano /etc/nginx/sites-available/delerium   # replace 'your-domain.com'

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
sudo systemctl reload nginx
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
