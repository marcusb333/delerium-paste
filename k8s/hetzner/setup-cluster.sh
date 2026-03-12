#!/bin/bash
set -euo pipefail

# =============================================================================
# Hetzner Cloud Kubernetes Cluster Setup
# =============================================================================
#
# This script provisions a production-ready K8s cluster on Hetzner Cloud.
#
# Prerequisites:
#   - hcloud CLI installed and authenticated (hcloud context create <name>)
#   - SSH key registered with Hetzner (hcloud ssh-key list)
#   - kubectl installed locally
#
# Usage:
#   ./setup-cluster.sh [--ssh-key <name>] [--location <nbg1|fsn1|hel1>]
#
# =============================================================================

SSH_KEY="${SSH_KEY:-default}"
LOCATION="${LOCATION:-nbg1}"
NETWORK_NAME="k8s-network"
FIREWALL_NAME="k8s-firewall"
SERVER_TYPE_CP="cx22"
SERVER_TYPE_WORKER="cx22"
K8S_VERSION="1.31"

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --ssh-key) SSH_KEY="$2"; shift 2 ;;
    --location) LOCATION="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo "=== Hetzner K8s Cluster Setup ==="
echo "Location: $LOCATION"
echo "SSH Key:  $SSH_KEY"
echo ""

# ---------------------------------------------------------------------------
# 1. Network
# ---------------------------------------------------------------------------
echo "--- Creating private network ---"
hcloud network create --name "$NETWORK_NAME" --ip-range 10.0.0.0/16 2>/dev/null || echo "Network already exists"
hcloud network add-subnet "$NETWORK_NAME" --type server --network-zone eu-central --ip-range 10.0.1.0/24 2>/dev/null || echo "Subnet already exists"

# ---------------------------------------------------------------------------
# 2. Firewall
# ---------------------------------------------------------------------------
echo "--- Creating firewall ---"
hcloud firewall create --name "$FIREWALL_NAME" 2>/dev/null || echo "Firewall already exists"

# Allow all internal traffic
hcloud firewall add-rule "$FIREWALL_NAME" --direction in --protocol tcp --port any --source-ips 10.0.0.0/16 2>/dev/null || true
hcloud firewall add-rule "$FIREWALL_NAME" --direction in --protocol udp --port any --source-ips 10.0.0.0/16 2>/dev/null || true
# SSH
hcloud firewall add-rule "$FIREWALL_NAME" --direction in --protocol tcp --port 22 --source-ips 0.0.0.0/0 --source-ips ::/0 2>/dev/null || true
# Kubernetes API
hcloud firewall add-rule "$FIREWALL_NAME" --direction in --protocol tcp --port 6443 --source-ips 0.0.0.0/0 --source-ips ::/0 2>/dev/null || true
# ICMP
hcloud firewall add-rule "$FIREWALL_NAME" --direction in --protocol icmp --source-ips 0.0.0.0/0 --source-ips ::/0 2>/dev/null || true

# ---------------------------------------------------------------------------
# 3. Servers
# ---------------------------------------------------------------------------
create_server() {
  local name=$1
  local type=$2
  local private_ip=$3

  echo "--- Creating server: $name ---"
  hcloud server create \
    --name "$name" \
    --type "$type" \
    --image ubuntu-24.04 \
    --location "$LOCATION" \
    --ssh-key "$SSH_KEY" \
    --firewall "$FIREWALL_NAME" \
    --network "$NETWORK_NAME" 2>/dev/null || echo "Server $name already exists"
}

create_server "k8s-control-plane" "$SERVER_TYPE_CP" "10.0.1.10"
create_server "k8s-worker-1" "$SERVER_TYPE_WORKER" "10.0.1.20"
create_server "k8s-worker-2" "$SERVER_TYPE_WORKER" "10.0.1.21"
create_server "k8s-worker-3" "$SERVER_TYPE_WORKER" "10.0.1.22"

echo ""
echo "Waiting 30s for servers to boot..."
sleep 30

# ---------------------------------------------------------------------------
# 4. Get IPs
# ---------------------------------------------------------------------------
CP_IP=$(hcloud server ip k8s-control-plane)
W1_IP=$(hcloud server ip k8s-worker-1)
W2_IP=$(hcloud server ip k8s-worker-2)
W3_IP=$(hcloud server ip k8s-worker-3)

echo ""
echo "=== Servers ==="
echo "Control plane: $CP_IP"
echo "Worker 1:      $W1_IP"
echo "Worker 2:      $W2_IP"
echo "Worker 3:      $W3_IP"

# ---------------------------------------------------------------------------
# 5. Install K8s on all nodes
# ---------------------------------------------------------------------------
SSH_OPTS="-o StrictHostKeyChecking=no -o IdentitiesOnly=yes"

install_k8s_base() {
  local ip=$1
  echo "--- Installing K8s prerequisites on $ip ---"
  ssh $SSH_OPTS root@"$ip" bash <<'REMOTE'
set -euo pipefail

# Disable swap
swapoff -a
sed -i '/swap/d' /etc/fstab

# Load kernel modules
cat > /etc/modules-load.d/k8s.conf <<EOF
overlay
br_netfilter
EOF
modprobe overlay
modprobe br_netfilter

# Sysctl params
cat > /etc/sysctl.d/k8s.conf <<EOF
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF
sysctl --system > /dev/null 2>&1

# Install containerd
apt-get update -qq
apt-get install -y -qq containerd apt-transport-https ca-certificates curl gpg > /dev/null

mkdir -p /etc/containerd
containerd config default > /etc/containerd/config.toml
sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml
systemctl restart containerd
systemctl enable containerd

# Add Kubernetes apt repo
mkdir -p /etc/apt/keyrings
curl -fsSL "https://pkgs.k8s.io/core:/stable:/v1.31/deb/Release.key" | gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
echo "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.31/deb/ /" > /etc/apt/sources.list.d/kubernetes.list

apt-get update -qq
apt-get install -y -qq kubelet kubeadm kubectl > /dev/null
apt-mark hold kubelet kubeadm kubectl
REMOTE
}

install_k8s_base "$CP_IP"
install_k8s_base "$W1_IP"
install_k8s_base "$W2_IP"
install_k8s_base "$W3_IP"

# ---------------------------------------------------------------------------
# 6. Init control plane with private IP
# ---------------------------------------------------------------------------
echo "--- Initializing control plane ---"

# Get control plane private IP
CP_PRIVATE_IP=$(hcloud server describe k8s-control-plane -o json | python3 -c "
import json, sys
data = json.load(sys.stdin)
for net in data['private_net']:
    print(net['ip'])
    break
")

ssh $SSH_OPTS root@"$CP_IP" bash <<REMOTE
set -euo pipefail

# CRITICAL: Set kubelet to use private IP BEFORE kubeadm init
echo 'KUBELET_EXTRA_ARGS=--node-ip=$CP_PRIVATE_IP' > /etc/default/kubelet

kubeadm init \
  --apiserver-advertise-address=$CP_PRIVATE_IP \
  --pod-network-cidr=10.244.0.0/16 \
  --apiserver-cert-extra-sans=$CP_IP,$CP_PRIVATE_IP
REMOTE

# ---------------------------------------------------------------------------
# 7. Get kubeconfig and join command
# ---------------------------------------------------------------------------
echo "--- Fetching kubeconfig ---"
mkdir -p ~/.kube
scp $SSH_OPTS root@"$CP_IP":/etc/kubernetes/admin.conf ~/.kube/config
# Replace private IP with public for external access
sed -i "s|$CP_PRIVATE_IP|$CP_IP|g" ~/.kube/config

JOIN_CMD=$(ssh $SSH_OPTS root@"$CP_IP" "kubeadm token create --print-join-command")

# ---------------------------------------------------------------------------
# 8. Join workers with private IPs
# ---------------------------------------------------------------------------
join_worker() {
  local public_ip=$1
  local private_ip=$2
  local name=$3
  echo "--- Joining $name ---"
  ssh $SSH_OPTS root@"$public_ip" bash <<REMOTE
echo 'KUBELET_EXTRA_ARGS=--node-ip=$private_ip' > /etc/default/kubelet
$JOIN_CMD
REMOTE
}

# Get worker private IPs
W1_PRIV=$(hcloud server describe k8s-worker-1 -o json | python3 -c "import json,sys; print([n['ip'] for n in json.load(sys.stdin)['private_net']][0])")
W2_PRIV=$(hcloud server describe k8s-worker-2 -o json | python3 -c "import json,sys; print([n['ip'] for n in json.load(sys.stdin)['private_net']][0])")
W3_PRIV=$(hcloud server describe k8s-worker-3 -o json | python3 -c "import json,sys; print([n['ip'] for n in json.load(sys.stdin)['private_net']][0])")

join_worker "$W1_IP" "$W1_PRIV" "k8s-worker-1"
join_worker "$W2_IP" "$W2_PRIV" "k8s-worker-2"
join_worker "$W3_IP" "$W3_PRIV" "k8s-worker-3"

echo "Waiting for nodes to register..."
sleep 15

# ---------------------------------------------------------------------------
# 9. Install Flannel CNI with correct interface
# ---------------------------------------------------------------------------
echo "--- Installing Flannel CNI ---"
kubectl apply -f https://github.com/flannel-io/flannel/releases/latest/download/kube-flannel.yml

# CRITICAL: Hetzner private interface is enp7s0, not ens10
echo "--- Patching Flannel to use private network interface (enp7s0) ---"
sleep 10
kubectl get daemonset kube-flannel-ds -n kube-flannel -o yaml | \
  sed 's/- --kube-subnet-mgr/- --kube-subnet-mgr\n        - --iface=enp7s0/' | \
  kubectl apply -f -

kubectl rollout status daemonset/kube-flannel-ds -n kube-flannel --timeout=120s

# ---------------------------------------------------------------------------
# 10. Install Hetzner Cloud Controller Manager
# ---------------------------------------------------------------------------
echo "--- Installing Hetzner CCM ---"

HCLOUD_TOKEN=$(hcloud context active | xargs -I{} grep -A1 "{}" ~/.config/hcloud/cli.toml | grep token | cut -d'"' -f2)
NETWORK_ID=$(hcloud network describe "$NETWORK_NAME" -o json | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")

kubectl -n kube-system create secret generic hcloud \
  --from-literal=token="$HCLOUD_TOKEN" \
  --from-literal=network="$NETWORK_ID"

kubectl apply -f https://github.com/hetznercloud/hcloud-cloud-controller-manager/releases/latest/download/ccm-networks.yaml

# ---------------------------------------------------------------------------
# 11. Install NGINX Gateway Fabric
# ---------------------------------------------------------------------------
echo "--- Installing Gateway API CRDs ---"
kubectl kustomize "https://github.com/nginx/nginx-gateway-fabric/config/crd/gateway-api/standard?ref=v2.4.2" | kubectl apply -f -

echo "--- Installing NGINX Gateway Fabric ---"
helm install ngf oci://ghcr.io/nginx/charts/nginx-gateway-fabric -n nginx-gateway --create-namespace

# ---------------------------------------------------------------------------
# 12. Fix reverse path filtering for Hetzner LB health checks
# ---------------------------------------------------------------------------
echo "--- Fixing rp_filter on all workers ---"
for worker_ip in "$W1_IP" "$W2_IP" "$W3_IP"; do
  ssh $SSH_OPTS root@"$worker_ip" bash <<'REMOTE'
sysctl -w net.ipv4.conf.enp7s0.rp_filter=2
sysctl -w net.ipv4.conf.all.rp_filter=2
cat > /etc/sysctl.d/99-hetzner-lb.conf <<EOF
net.ipv4.conf.enp7s0.rp_filter=2
net.ipv4.conf.all.rp_filter=2
EOF
REMOTE
done

echo ""
echo "=== Cluster setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Create secrets:  kubectl apply -f k8s/00-namespace.yaml"
echo "     kubectl -n delerium create secret generic delerium-secrets \\"
echo "       --from-literal=DELETION_TOKEN_PEPPER=<pepper> \\"
echo "       --from-literal=POSTGRES_PASSWORD=<password>"
echo ""
echo "  2. Deploy app:      kubectl apply -f k8s/"
echo ""
echo "  3. Create TLS secret (Cloudflare Origin Certificate):"
echo "     kubectl -n delerium create secret tls iloverexs-com-tls \\"
echo "       --cert=origin-cert.pem --key=origin-key.pem"
echo ""
echo "  4. Add LB targets if not auto-assigned:"
echo "     hcloud load-balancer add-target <lb-name> --server k8s-worker-1 --use-private-ip"
echo "     hcloud load-balancer add-target <lb-name> --server k8s-worker-2 --use-private-ip"
echo "     hcloud load-balancer add-target <lb-name> --server k8s-worker-3 --use-private-ip"
echo ""
echo "  5. Point DNS A record to the load balancer IP"
