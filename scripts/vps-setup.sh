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
# 2. Create hooks directory and hooks.json
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
  # Replace the empty string placeholder with the real token
  sed -i "s/\"value\": \"\"/\"value\": \"${DEPLOY_TOKEN}\"/" "${HOOKS_DIR}/hooks.json"
  echo "[setup] DEPLOY_TOKEN written to hooks.json."
fi

chmod 600 "${HOOKS_DIR}/hooks.json"

# ---------------------------------------------------------------------------
# 3. Create /opt/deploy.sh
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
# 4. Create systemd service for webhook
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
# 5. Enable and start the service
# ---------------------------------------------------------------------------
echo "[setup] Enabling and starting webhook service..."
systemctl daemon-reload
systemctl enable webhook
systemctl start webhook
systemctl status webhook --no-pager

# ---------------------------------------------------------------------------
# 6. Print nginx config snippet
# ---------------------------------------------------------------------------
echo ""
echo "========================================================"
echo "  Add the following location block to your nginx server"
echo "  block (e.g. /etc/nginx/sites-available/delerium):"
echo "========================================================"
cat <<'NGINX'

    location /hooks/ {
        proxy_pass http://localhost:9000/hooks/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
NGINX
echo "========================================================"
echo "[setup] Complete. Reload nginx after adding the snippet."
