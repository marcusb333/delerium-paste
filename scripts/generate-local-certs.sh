#!/bin/bash
# Generates a locally-trusted TLS certificate for local development.
# Automatically installs mkcert (via brew/apt/pacman) if not present.
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

# Install mkcert if not present
if ! command -v mkcert > /dev/null 2>&1; then
    echo "📦 Installing mkcert for browser-trusted local certs..."
    if command -v brew > /dev/null 2>&1; then
        brew install mkcert 2>&1 | tail -1
    elif command -v apt-get > /dev/null 2>&1; then
        sudo apt-get install -y -qq mkcert
    elif command -v pacman > /dev/null 2>&1; then
        sudo pacman -S --noconfirm mkcert
    fi
fi

if command -v mkcert > /dev/null 2>&1; then
    echo "🔐 Installing local CA (may require your password)..."
    mkcert -install
    echo "🔐 Generating locally-trusted TLS certificate..."
    mkcert -key-file "$KEY" -cert-file "$CERT" localhost 127.0.0.1
    echo "✅ TLS cert generated (trusted by browser): $CERT_DIR"
else
    echo "⚠️  Could not install mkcert — falling back to self-signed certificate"
    openssl req -x509 -nodes -newkey rsa:2048 \
        -keyout "$KEY" \
        -out "$CERT" \
        -days 3650 \
        -subj "/CN=localhost" \
        -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
        2>/dev/null
    echo "✅ TLS cert generated: $CERT_DIR"
    echo "   (Browser will show a security warning — accept it once for local dev)"
fi
