# Kubernetes Deployment

Deploy delerium-paste on a Hetzner Cloud Kubernetes cluster with NGINX Gateway Fabric, Cloudflare TLS, and a Hetzner Load Balancer.

## Architecture

```
Client → Cloudflare (edge TLS) → Hetzner LB → NGINX Gateway Fabric → delerium-server pods
                                                                    → postgres
```

- **3 delerium-server replicas** behind a Gateway API HTTPRoute
- **1 postgres instance** (ClusterIP, internal only)
- **NGINX Gateway Fabric v2.4.2** as the ingress controller (Gateway API)
- **Cloudflare Full (Strict)** SSL with Origin Certificate for end-to-end encryption
- **Hetzner Cloud Controller Manager** for automatic load balancer provisioning

## Quick Start (Existing Cluster)

If you already have a K8s cluster with NGINX Gateway Fabric installed:

```bash
./deploy.sh \
  --pepper "your-deletion-token-pepper" \
  --db-password "your-postgres-password" \
  --tls-cert /path/to/origin-cert.pem \
  --tls-key /path/to/origin-key.pem
```

## Full Cluster Setup (From Scratch)

Provisions a 4-node cluster on Hetzner Cloud with everything pre-configured:

```bash
# Authenticate hcloud CLI first
hcloud context create my-cluster

# Run setup (takes ~10 minutes)
./setup-cluster.sh --ssh-key your-ssh-key-name --location nbg1

# Then deploy the app
./deploy.sh --pepper "your-pepper" --db-password "your-password"
```

## Manifests

| File | Description |
|------|-------------|
| `00-namespace.yaml` | Namespace and secret creation instructions |
| `10-postgres.yaml` | Postgres deployment and ClusterIP service |
| `20-delerium-server.yaml` | delerium-server deployment (3 replicas) with init container |
| `30-gateway.yaml` | Gateway and HTTPRoute for iloverexs.com |
| `setup-cluster.sh` | Full Hetzner cluster provisioning script |
| `deploy.sh` | Application deployment script |

## Hetzner-Specific Notes

These are lessons learned from production setup — they'll save you hours of debugging.

### Private Network Interface

Hetzner's private network interface is `enp7s0`, not the commonly documented `ens10`. Flannel must be configured with `--iface=enp7s0` or pod-to-pod communication will fail across nodes.

### Kubelet Node IPs

Always set `--node-ip` to the private IP **before** running `kubeadm init/join`. Without this, nodes register with public IPs, and inter-node traffic hits the Hetzner firewall (which blocks most ports on public interfaces). This is the `setup-cluster.sh` default behavior.

```bash
echo 'KUBELET_EXTRA_ARGS=--node-ip=10.0.1.x' > /etc/default/kubelet
```

### Load Balancer Targets

HCCM may not automatically add server targets to provisioned load balancers. If the LB shows "No targets", add them manually:

```bash
hcloud load-balancer add-target <lb-name> --server k8s-worker-1 --use-private-ip
hcloud load-balancer add-target <lb-name> --server k8s-worker-2 --use-private-ip
hcloud load-balancer add-target <lb-name> --server k8s-worker-3 --use-private-ip
```

### SSH Access

If you have multiple SSH keys, you may get "too many authentication failures." Always use:

```bash
ssh -o IdentitiesOnly=yes -i ~/.ssh/your_key root@<node-ip>
```

### Docker Image Platform

Build images for `linux/amd64` explicitly when pushing from an ARM Mac:

```bash
docker buildx build --platform linux/amd64 -t marcusb333/delerium-server:latest --push .
```

## Updating the Application

```bash
# Build and push new image
docker buildx build --platform linux/amd64 \
  -t marcusb333/delerium-server:v1.7.0 \
  -t marcusb333/delerium-server:latest \
  --push .

# Rolling update
kubectl set image deployment/delerium-server \
  delerium-server=marcusb333/delerium-server:v1.7.0 \
  -n delerium

# Watch rollout
kubectl rollout status deployment/delerium-server -n delerium
```

## TLS Setup (Cloudflare)

1. In Cloudflare Dashboard: **SSL/TLS → Origin Server → Create Certificate**
2. Hostnames: `iloverexs.com` and `*.iloverexs.com`, validity 15 years
3. Create the K8s secret:
   ```bash
   kubectl -n delerium create secret tls iloverexs-com-tls \
     --cert=origin-cert.pem \
     --key=origin-key.pem
   ```
4. Set SSL mode to **Full (Strict)** in Cloudflare
5. Enable orange cloud (Proxied) on DNS A records

## CI/CD

The `.github/workflows/docker-publish.yml` workflow automatically builds and pushes the Docker image:

- **On push to main**: tags as `latest` and `sha-<commit>`
- **On release**: additionally tags with the release version (e.g. `v1.8.0`)

### Setup

Add these secrets to your GitHub repo (Settings → Secrets → Actions):

- `DOCKERHUB_USERNAME` — your Docker Hub username
- `DOCKERHUB_TOKEN` — a Docker Hub access token (not your password)

### Makefile

Common operations are wrapped in `make` targets. Run `make help` for the full list:

```bash
make build-push              # Build and push image
make deploy                  # Apply all k8s manifests
make rollout NEXT_VERSION=v1.8.0  # Rolling update
make status                  # Full cluster overview
make health                  # Quick health check
make lb-fix                  # Re-add LB targets if wiped
make fix-all                 # Run all Hetzner fixes
make ssh-worker N=1          # SSH into a worker
```
