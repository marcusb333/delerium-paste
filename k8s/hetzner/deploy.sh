#!/bin/bash
set -euo pipefail

# =============================================================================
# Deploy delerium-paste to an existing Kubernetes cluster
# =============================================================================
#
# Assumes:
#   - Cluster is running with NGINX Gateway Fabric installed
#   - kubectl is configured
#
# Usage:
#   ./deploy.sh --pepper <token-pepper> --db-password <password> [--tls-cert <path> --tls-key <path>]
#
# =============================================================================

PEPPER=""
DB_PASSWORD=""
TLS_CERT=""
TLS_KEY=""
IMAGE_TAG="latest"
NAMESPACE="delerium"

while [[ $# -gt 0 ]]; do
  case $1 in
    --pepper) PEPPER="$2"; shift 2 ;;
    --db-password) DB_PASSWORD="$2"; shift 2 ;;
    --tls-cert) TLS_CERT="$2"; shift 2 ;;
    --tls-key) TLS_KEY="$2"; shift 2 ;;
    --image-tag) IMAGE_TAG="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ -z "$PEPPER" || -z "$DB_PASSWORD" ]]; then
  echo "Usage: ./deploy.sh --pepper <token-pepper> --db-password <password>"
  echo ""
  echo "Options:"
  echo "  --pepper       DELETION_TOKEN_PEPPER value (required)"
  echo "  --db-password  Postgres password (required)"
  echo "  --tls-cert     Path to TLS certificate PEM (optional)"
  echo "  --tls-key      Path to TLS private key PEM (optional)"
  echo "  --image-tag    Docker image tag (default: latest)"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Deploying delerium-paste ==="
echo "Namespace:  $NAMESPACE"
echo "Image tag:  $IMAGE_TAG"
echo ""

# Create namespace
echo "--- Creating namespace ---"
kubectl apply -f "$SCRIPT_DIR/00-namespace.yaml"

# Create secrets
echo "--- Creating secrets ---"
kubectl -n "$NAMESPACE" create secret generic delerium-secrets \
  --from-literal=DELETION_TOKEN_PEPPER="$PEPPER" \
  --from-literal=POSTGRES_PASSWORD="$DB_PASSWORD" \
  --dry-run=client -o yaml | kubectl apply -f -

# Create TLS secret if certs provided
if [[ -n "$TLS_CERT" && -n "$TLS_KEY" ]]; then
  echo "--- Creating TLS secret ---"
  kubectl -n "$NAMESPACE" create secret tls iloverexs-com-tls \
    --cert="$TLS_CERT" \
    --key="$TLS_KEY" \
    --dry-run=client -o yaml | kubectl apply -f -
fi

# Update image tag in deployment if not "latest"
if [[ "$IMAGE_TAG" != "latest" ]]; then
  sed "s|marcusb333/delerium-server:latest|marcusb333/delerium-server:$IMAGE_TAG|g" \
    "$SCRIPT_DIR/20-delerium-server.yaml" | kubectl apply -f -
else
  kubectl apply -f "$SCRIPT_DIR/20-delerium-server.yaml"
fi

# Deploy postgres and gateway
echo "--- Deploying Postgres ---"
kubectl apply -f "$SCRIPT_DIR/10-postgres.yaml"

echo "--- Waiting for Postgres to be ready ---"
kubectl rollout status deployment/postgres -n "$NAMESPACE" --timeout=120s

echo "--- Deploying delerium-server ---"
kubectl apply -f "$SCRIPT_DIR/20-delerium-server.yaml"

echo "--- Creating Gateway and HTTPRoute ---"
kubectl apply -f "$SCRIPT_DIR/30-gateway.yaml"

echo "--- Waiting for delerium-server to be ready ---"
kubectl rollout status deployment/delerium-server -n "$NAMESPACE" --timeout=180s

echo ""
echo "=== Deployment complete ==="
kubectl get pods -n "$NAMESPACE"
echo ""
echo "Check gateway status:  kubectl get gateway -n $NAMESPACE"
echo "Check services:        kubectl get svc -n $NAMESPACE"
