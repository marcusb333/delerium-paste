#!/bin/bash
# One-time VPS setup script for the Delerium deploy webhook.
# Run as root (or with sudo) on the VPS.
set -euo pipefail

DEPLOY_DIR="/home/noob/delerium-paste"
HOOKS_DIR="/opt/hooks"
WEBHOOK_PORT=9000

# ---------------------------------------------------------------------------
# 1. Install webhook
# ---------------------------------------------------------------------------
echo "[setup] Installing webhook..."
apt-get update -qq
apt-get install -y webhook

# ---------------------------------------------------------------------------
# 2. Generate .env if it does not already exist
# ---------------------------------------------------------------------------
ENV_FILE="${DEPLOY_DIR}/.env"
mkdir -p "$DEPLOY_DIR"

if [ -f "$ENV_FILE" ]; then
  echo "[setup] ${ENV_FILE} already exists — skipping generation."
else
  echo "[setup] Generating ${ENV_FILE} with random secrets..."
  PEPPER=$(openssl rand -hex 32)
  PG_PASS=$(openssl rand -hex 16)
  cat > "$ENV_FILE" <<EOF
DELETION_TOKEN_PEPPER=${PEPPER}
POSTGRES_PASSWORD=${PG_PASS}
DB_PASSWORD=${PG_PASS}
EOF
  chmod 600 "$ENV_FILE"
  echo "[setup] .env written. Values:"
  echo "        DELETION_TOKEN_PEPPER=${PEPPER}"
  echo "        POSTGRES_PASSWORD=${PG_PASS}"
  echo "        DB_PASSWORD=${PG_PASS}"
  echo "        Store these somewhere safe — they cannot be recovered if lost."
fi

# ---------------------------------------------------------------------------
# 3. Create hooks directory and hooks.json
# ---------------------------------------------------------------------------
echo "[setup] Writing ${HOOKS_DIR}/hooks.json..."
mkdir -p "$HOOKS_DIR"

cat > "${HOOKS_DIR}/hooks.json" <<'EOF'
[
  {
    "id": "deploy",
    "execute-command": "/opt/deploy.sh",
    "command-working-directory": "/home/noob/delerium-paste",
    "pass-arguments-to-command": [
      {
        "source": "payload",
        "name": "tag"
      }
    ],
    "trigger-rule": {
      "match": {
        "type": "value",
        "value": "",
        "parameter": {
          "source": "header",
          "name": "X-Deploy-Token"
        }
      }
    },
    "trigger-rule-mismatch-http-response-code": 403
  }
]
EOF

# Patch the empty trigger-rule value with the actual DEPLOY_TOKEN from the
# environment (so the secret never lives in a committed file).
if [ -z "${DEPLOY_TOKEN:-}" ]; then
  echo "[setup] WARNING: DEPLOY_TOKEN env var is not set."
  echo "        Edit ${HOOKS_DIR}/hooks.json and replace the empty \"value\""
  echo "        field in trigger-rule.match with your actual deploy token."
else
  sed -i "s/\"value\": \"\"/\"value\": \"${DEPLOY_TOKEN}\"/" "${HOOKS_DIR}/hooks.json"
  echo "[setup] DEPLOY_TOKEN written to hooks.json."
fi

chmod 600 "${HOOKS_DIR}/hooks.json"

# ---------------------------------------------------------------------------
# 4. Create /opt/deploy.sh
# ---------------------------------------------------------------------------
echo "[setup] Writing /opt/deploy.sh..."
cat > /opt/deploy.sh <<'DEPLOY_SCRIPT'
#!/bin/bash
set -euo pipefail

TAG="${1:-latest}"
cd /home/noob/delerium-paste

export IMAGE_TAG="$TAG"
docker compose -f docker-compose-prod.yml pull server
docker compose -f docker-compose-prod.yml up -d --force-recreate --no-deps server
docker image prune -f

echo "[deploy] Done: marcusb333/delerium-server:$TAG"
DEPLOY_SCRIPT

chmod 755 /opt/deploy.sh

# ---------------------------------------------------------------------------
# 5. Create systemd service for webhook
# ---------------------------------------------------------------------------
echo "[setup] Writing /etc/systemd/system/webhook.service..."
cat > /etc/systemd/system/webhook.service <<EOF
[Unit]
Description=Delerium deploy webhook listener
After=network.target

[Service]
Type=simple
User=noob
ExecStart=/usr/bin/webhook -hooks ${HOOKS_DIR}/hooks.json -port ${WEBHOOK_PORT} -verbose
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# ---------------------------------------------------------------------------
# 6. Enable and start the service
# ---------------------------------------------------------------------------
echo "[setup] Enabling and starting webhook service..."
systemctl daemon-reload
systemctl enable webhook
systemctl start webhook
systemctl status webhook --no-pager

# ---------------------------------------------------------------------------
# 7. Remind about remaining manual steps
# ---------------------------------------------------------------------------
echo ""
echo "========================================================"
echo "  Next steps:"
echo ""
echo "  1. Copy docker-compose-prod.yml to ${DEPLOY_DIR}/"
echo "     (from your local machine: scp docker-compose-prod.yml noob@vps:${DEPLOY_DIR}/)"
echo ""
echo "  2. Configure nginx — use scripts/nginx-snippet.conf as a template:"
echo "     sudo cp /tmp/nginx-snippet.conf /etc/nginx/sites-available/delerium"
echo "     sudo ln -s /etc/nginx/sites-available/delerium /etc/nginx/sites-enabled/"
echo "     # Edit the file and replace 'your-domain.com' with your actual domain"
echo "     # Then obtain a certificate:"
echo "     sudo apt install -y certbot python3-certbot-nginx"
echo "     sudo certbot --nginx -d your-domain.com"
echo ""
echo "  3. Start services for the first time:"
echo "     cd ${DEPLOY_DIR}"
echo "     IMAGE_TAG=latest docker compose -f docker-compose-prod.yml up -d"
echo "========================================================"
echo "[setup] Complete."
