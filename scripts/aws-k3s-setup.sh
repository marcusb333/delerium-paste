#!/usr/bin/env bash
# aws-k3s-setup.sh — Bootstrap a k3s cluster on an EC2 instance for Delerium.
#
# Run this ON the EC2 instance after SSH'ing in.
# Prerequisites: Ubuntu 22.04+ EC2 instance with ports 80, 443, 6443 open.
#
# Usage:
#   curl -sfL https://raw.githubusercontent.com/<repo>/main/scripts/aws-k3s-setup.sh | bash
#   # — or —
#   ./scripts/aws-k3s-setup.sh

set -euo pipefail

DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"

echo "============================================"
echo "  Delerium — k3s on AWS EC2 Setup"
echo "============================================"
echo ""

# ---------- Gather inputs ----------
if [ -z "$DOMAIN" ]; then
  read -rp "Enter your domain (e.g. paste.example.com): " DOMAIN
fi
if [ -z "$EMAIL" ]; then
  read -rp "Enter your email (for Let's Encrypt): " EMAIL
fi

echo ""
echo "Domain : $DOMAIN"
echo "Email  : $EMAIL"
echo ""

# ---------- 1. Install k3s ----------
echo "--- Step 1/5: Installing k3s ---"
if command -v k3s &>/dev/null; then
  echo "k3s already installed, skipping."
else
  curl -sfL https://get.k3s.io | sh -
  echo "Waiting for k3s to be ready..."
  sleep 5
  sudo k3s kubectl wait --for=condition=Ready node --all --timeout=120s
fi

# Make kubectl available without sudo
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
if [ ! -f "$HOME/.kube/config" ]; then
  mkdir -p "$HOME/.kube"
  sudo cp /etc/rancher/k3s/k3s.yaml "$HOME/.kube/config"
  sudo chown "$(id -u):$(id -g)" "$HOME/.kube/config"
fi
export KUBECONFIG="$HOME/.kube/config"

echo "k3s is ready."
kubectl get nodes
echo ""

# ---------- 2. Install cert-manager ----------
echo "--- Step 2/5: Installing cert-manager ---"
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml
echo "Waiting for cert-manager pods..."
kubectl wait --namespace cert-manager --for=condition=Ready pod --all --timeout=120s
echo "cert-manager is ready."
echo ""

# ---------- 3. Apply ClusterIssuers ----------
echo "--- Step 3/5: Configuring Let's Encrypt issuers ---"
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging
spec:
  acme:
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    email: ${EMAIL}
    privateKeySecretRef:
      name: letsencrypt-staging-key
    solvers:
      - http01:
          ingress:
            ingressClassName: traefik
---
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ${EMAIL}
    privateKeySecretRef:
      name: letsencrypt-prod-key
    solvers:
      - http01:
          ingress:
            ingressClassName: traefik
EOF
echo ""

# ---------- 4. Generate secret & apply manifests ----------
echo "--- Step 4/5: Deploying Delerium ---"

# Create namespace first
kubectl apply -f - <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: delerium
EOF

# Generate and apply the deletion token secret
PEPPER=$(openssl rand -hex 32)
kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: delerium-server-secret
  namespace: delerium
type: Opaque
stringData:
  DELETION_TOKEN_PEPPER: "${PEPPER}"
EOF

# Check if we're running from the repo root
if [ -f "deploy/aws-k3s/kustomization.yaml" ]; then
  # Patch the ingress domain before applying
  sed -i "s/test\.delerium\.cc/${DOMAIN}/g" k8s/ingress.yaml
  kubectl apply -k deploy/aws-k3s/
else
  echo "WARNING: Not in repo root. Apply manifests manually:"
  echo "  kubectl apply -k deploy/aws-k3s/"
fi
echo ""

# ---------- 5. Verify ----------
echo "--- Step 5/5: Verifying deployment ---"
echo "Waiting for pods to start..."
sleep 10
kubectl get pods -n delerium
echo ""
kubectl get svc -n delerium
echo ""
kubectl get ingress -n delerium
echo ""

echo "============================================"
echo "  Setup complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Point DNS for '${DOMAIN}' to this server's public IP"
echo "  2. Verify staging TLS works: curl -vk https://${DOMAIN}"
echo "  3. Switch to production certs:"
echo "     sed -i 's/letsencrypt-staging/letsencrypt-prod/' k8s/ingress.yaml"
echo "     kubectl apply -k deploy/aws-k3s/"
echo "     kubectl delete secret delerium-tls -n delerium"
echo "  4. Monitor: kubectl get pods -n delerium -w"
echo ""
echo "Useful commands:"
echo "  kubectl logs -n delerium -l app=delerium-server -f"
echo "  kubectl logs -n delerium -l app=delerium-web -f"
echo "  kubectl get certificate -n delerium"
echo ""
