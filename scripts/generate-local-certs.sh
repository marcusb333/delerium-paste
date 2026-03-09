#!/bin/bash
# Generates a self-signed TLS certificate for local development.
# Output: ssl/local/localhost.crt and ssl/local/localhost.key
# Skips generation if both files already exist.
set -e

CERT_DIR="$(cd "$(dirname "$0")/.." && pwd)/ssl/local"
CERT="$CERT_DIR/localhost.crt"
KEY="$CERT_DIR/localhost.key"

if [ -f "$CERT" ] && [ -f "$KEY" ]; then
    echo "✅ Local TLS certs already exist ($CERT_DIR)"
    exit 0
fi

mkdir -p "$CERT_DIR"

echo "🔐 Generating self-signed TLS certificate for localhost..."
openssl req -x509 -nodes -newkey rsa:2048 \
    -keyout "$KEY" \
    -out "$CERT" \
    -days 3650 \
    -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
    2>/dev/null

echo "✅ TLS cert generated: $CERT_DIR"
echo "   (Browser will show a security warning — accept it once for local dev)"
