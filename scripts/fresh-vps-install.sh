#!/bin/bash
# fresh-vps-install.sh
#
# Standalone installer for Delerium on a fresh Ubuntu/Debian VPS.
# Pulls the latest image from Docker Hub — no git repo required.
# Cleans up any previous Delerium installation before starting.
#
# Usage (as root or with sudo):
#   curl -fsSL https://raw.githubusercontent.com/marcusb333/delerium-paste/main/scripts/fresh-vps-install.sh | sudo bash
# or:
#   sudo bash fresh-vps-install.sh
#
# To wipe existing paste data (nuclear reset):
#   sudo WIPE_DATA=1 bash fresh-vps-install.sh

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────────────
DOMAIN="delerium.cc"
SSL_EMAIL="admin@delerium.cc"
INSTALL_DIR="/opt/delerium"
IMAGE="marcusb333/delerium-server:latest"
WIPE_DATA="${WIPE_DATA:-0}"

# ── Colours ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[install]${NC} $*"; }
ok()   { echo -e "${GREEN}[ok]${NC}     $*"; }
warn() { echo -e "${YELLOW}[warn]${NC}   $*"; }
die()  { echo -e "${RED}[error]${NC}  $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run as root:  sudo bash $0"

echo ""
log "=============================================="
log " Delerium VPS Installer"
log " Domain : $DOMAIN"
log " Image  : $IMAGE"
log " Dir    : $INSTALL_DIR"
[[ "$WIPE_DATA" == "1" ]] && warn " WIPE_DATA=1 — existing paste data will be deleted!"
log "=============================================="
echo ""

# ── 1. Clean up existing Delerium installation ─────────────────────────────────
log "Step 1/9 — Cleaning up previous installation..."

# Stop and remove containers from current install dir (if any)
if [[ -f "$INSTALL_DIR/docker-compose.yml" ]]; then
    warn "Stopping existing containers..."
    docker compose -f "$INSTALL_DIR/docker-compose.yml" down --remove-orphans 2>/dev/null || true
fi

# Also clean up old git-repo-based installs (vps-setup.sh placed files here)
OLD_DIRS=("/home/noob/delerium-paste" "/root/delerium-paste" "/home/ubuntu/delerium-paste")
for OLD in "${OLD_DIRS[@]}"; do
    if [[ -f "$OLD/docker-compose-prod.yml" ]]; then
        warn "Stopping old containers in $OLD..."
        docker compose -f "$OLD/docker-compose-prod.yml" down --remove-orphans 2>/dev/null || true
    fi
    if [[ -f "$OLD/docker-compose.yml" ]]; then
        docker compose -f "$OLD/docker-compose.yml" down --remove-orphans 2>/dev/null || true
    fi
done

# Remove old webhook systemd service (from vps-setup.sh)
if systemctl is-active --quiet webhook 2>/dev/null; then
    warn "Stopping webhook service..."
    systemctl stop webhook 2>/dev/null || true
    systemctl disable webhook 2>/dev/null || true
fi
rm -f /etc/systemd/system/webhook.service
rm -f /opt/deploy.sh
rm -rf /opt/hooks
systemctl daemon-reload 2>/dev/null || true

# Remove any stale Delerium nginx configs
rm -f /etc/nginx/sites-enabled/delerium
rm -f /etc/nginx/sites-available/delerium
rm -f /etc/nginx/conf.d/delerium-ratelimit.conf

# Optionally wipe paste data
if [[ "$WIPE_DATA" == "1" ]]; then
    warn "Removing Docker volume pgdata..."
    docker volume rm delerium_pgdata 2>/dev/null || true
    docker volume rm "$(basename "$INSTALL_DIR")_pgdata" 2>/dev/null || true
    # Try compose-project-named volumes too
    docker volume rm delerium-paste_pgdata 2>/dev/null || true
fi

# Prune dangling/old Delerium images (keep postgres, it's shared)
docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' \
    | grep 'marcusb333/delerium-server' \
    | awk '{print $2}' \
    | xargs -r docker rmi -f 2>/dev/null || true

ok "Cleanup complete"
echo ""

# ── 2. Install system dependencies ────────────────────────────────────────────
log "Step 2/9 — Installing system packages..."
apt-get update -qq
apt-get install -y -qq curl openssl nginx certbot python3-certbot-nginx make
ok "curl, openssl, nginx, certbot, make installed"

# Docker
if ! command -v docker &>/dev/null; then
    log "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    ok "Docker installed: $(docker --version)"
else
    ok "Docker already present: $(docker --version)"
fi

# Docker Compose plugin (v2)
if ! docker compose version &>/dev/null 2>&1; then
    log "Installing Docker Compose plugin..."
    apt-get install -y -qq docker-compose-plugin
fi
ok "Docker Compose: $(docker compose version --short 2>/dev/null || echo 'ok')"

# Add the invoking user to the docker group so they don't need sudo for docker
if [[ -n "${SUDO_USER:-}" ]]; then
    usermod -aG docker "$SUDO_USER"
    ok "Added $SUDO_USER to docker group (re-login to take effect)"
fi
echo ""

# ── 3. Create install directory and .env ──────────────────────────────────────
log "Step 3/9 — Setting up $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"

ENV_FILE="$INSTALL_DIR/.env"
if [[ -f "$ENV_FILE" ]] && [[ "$WIPE_DATA" != "1" ]]; then
    warn ".env already exists — preserving existing secrets (use WIPE_DATA=1 to reset)"
else
    log "Generating secrets..."
    PEPPER=$(openssl rand -hex 32)
    PG_PASS=$(openssl rand -hex 16)
    cat > "$ENV_FILE" <<EOF
# Delerium — generated $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# WARNING: Do not change these values after first deploy — existing data will become inaccessible.
DELETION_TOKEN_PEPPER=${PEPPER}
POSTGRES_PASSWORD=${PG_PASS}
EOF
    chmod 600 "$ENV_FILE"
    ok "Secrets written to $ENV_FILE  ← back this file up!"
fi
echo ""

# ── 4. Write docker-compose.yml ───────────────────────────────────────────────
log "Step 4/9 — Writing docker-compose.yml..."
cat > "$INSTALL_DIR/docker-compose.yml" <<'COMPOSE'
volumes:
  pgdata:
    driver: local

networks:
  app-network:
    driver: bridge

services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    env_file:
      - .env
    environment:
      POSTGRES_DB: delerium
      POSTGRES_USER: delerium
      # POSTGRES_PASSWORD is read from .env
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U delerium -d delerium"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 15s
    networks:
      - app-network

  server:
    image: marcusb333/delerium-server:latest
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    env_file:
      - .env
    environment:
      - DB_PATH=jdbc:postgresql://postgres:5432/delerium
      - DB_USER=delerium
      - DB_PASSWORD=${POSTGRES_PASSWORD}
      - DATA_ENC_KEYRING_PATH=/app/keyring.json
      - DATA_ENC_ROTATION_DAYS=30
    ports:
      - "127.0.0.1:8080:8080"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    networks:
      - app-network
COMPOSE
ok "docker-compose.yml written"
echo ""

# ── 5. Write a helper update script ───────────────────────────────────────────
cat > "$INSTALL_DIR/update.sh" <<'SCRIPT'
#!/bin/bash
# Pull the latest Delerium image and restart.
set -euo pipefail
cd "$(dirname "$0")"
docker compose pull server
docker compose up -d --force-recreate --no-deps server
docker image prune -f
echo "Update complete. Running: $(docker compose images server --quiet)"
SCRIPT
chmod 755 "$INSTALL_DIR/update.sh"

# ── 6. Configure nginx (HTTP-only first so certbot ACME works) ────────────────
log "Step 5/9 — Configuring nginx (HTTP, pre-SSL)..."

# Rate-limit zone must live in the http{} context, not inside a server block
cat > /etc/nginx/conf.d/delerium-ratelimit.conf <<EOF
limit_req_zone \$binary_remote_addr zone=api_limit:10m rate=10r/m;
EOF

cat > /etc/nginx/sites-available/delerium <<EOF
server {
    listen 80;
    server_name ${DOMAIN};

    # Allow Let's Encrypt ACME challenges
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}
EOF

ln -sf /etc/nginx/sites-available/delerium /etc/nginx/sites-enabled/delerium
rm -f /etc/nginx/sites-enabled/default  # disable placeholder page
mkdir -p /var/www/certbot

nginx -t
systemctl enable nginx
systemctl reload nginx
ok "Nginx running (HTTP only)"
echo ""

# ── 7. Obtain SSL certificate ─────────────────────────────────────────────────
log "Step 6/9 — Obtaining SSL certificate for $DOMAIN..."
SSL_OK=0
if certbot certonly --webroot \
        -w /var/www/certbot \
        -d "$DOMAIN" \
        --non-interactive \
        --agree-tos \
        --email "$SSL_EMAIL"; then
    ok "SSL certificate obtained"
    SSL_OK=1
else
    warn "certbot failed — continuing without SSL. Run manually:"
    warn "  certbot --nginx -d $DOMAIN"
fi
echo ""

# ── 8. Write final nginx config (HTTPS + proxy) ───────────────────────────────
log "Step 7/9 — Writing full nginx config..."
CERT_PATH="/etc/letsencrypt/live/${DOMAIN}"

if [[ "$SSL_OK" == "1" && -f "${CERT_PATH}/fullchain.pem" ]]; then
    cat > /etc/nginx/sites-available/delerium <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN};

    ssl_certificate     ${CERT_PATH}/fullchain.pem;
    ssl_certificate_key ${CERT_PATH}/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; media-src 'none'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; upgrade-insecure-requests;" always;
    add_header Permissions-Policy "accelerometer=(), geolocation=(), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # API — rate limited, proxied to Delerium server
    location /api/ {
        limit_req zone=api_limit burst=5 nodelay;

        proxy_pass         http://127.0.0.1:8080/api/;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    # Everything else — static assets + SPA served by the Delerium container
    location / {
        proxy_pass         http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }
}
EOF

    nginx -t && systemctl reload nginx
    ok "Nginx configured with HTTPS"
else
    warn "Skipping HTTPS nginx config (no cert). HTTP only for now."
fi
echo ""

# ── 9. Pull image and start services ──────────────────────────────────────────
log "Step 8/9 — Pulling $IMAGE..."
docker compose -f "$INSTALL_DIR/docker-compose.yml" pull

log "Starting services..."
docker compose -f "$INSTALL_DIR/docker-compose.yml" up -d
echo ""

# ── 10. Health check ──────────────────────────────────────────────────────────
log "Step 9/9 — Waiting for server to become healthy (up to 90 s)..."
HEALTHY=0
for i in $(seq 1 18); do
    if curl -sf http://127.0.0.1:8080/health >/dev/null 2>&1; then
        HEALTHY=1
        break
    fi
    printf "  attempt %d/18 ...\r" "$i"
    sleep 5
done
echo ""

if [[ "$HEALTHY" == "1" ]]; then
    ok "Server is healthy"
else
    warn "Server not yet responding — it may still be starting. Check logs:"
    warn "  docker compose -f $INSTALL_DIR/docker-compose.yml logs -f server"
fi

# certbot auto-renewal sanity check
if systemctl is-enabled certbot.timer &>/dev/null 2>&1; then
    ok "certbot auto-renewal timer is active"
else
    warn "certbot renewal timer not found. Add a cron job:"
    warn "  0 3 * * * certbot renew --quiet && systemctl reload nginx"
fi

echo ""
log "=============================================="
ok " Delerium is running!"
log "=============================================="
echo ""
if [[ "$SSL_OK" == "1" ]]; then
    echo "  App    : https://${DOMAIN}"
    echo "  Health : https://${DOMAIN}/api/health"
else
    echo "  App    : http://${DOMAIN}  (SSL pending)"
    echo "  Health : http://${DOMAIN}/api/health"
fi
echo ""
echo "  Manage:"
echo "    cd $INSTALL_DIR"
echo "    docker compose logs -f server           # live logs"
echo "    bash update.sh                          # pull & restart latest"
echo "    docker compose down                     # stop everything"
echo ""
echo "  Secrets: $ENV_FILE  ← keep a safe backup of this file!"
echo ""
