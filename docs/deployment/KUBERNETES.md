# Kubernetes Deployment

Deploy Delirium to a Kubernetes cluster using the manifests in `k8s/`.

## Prerequisites

- `kubectl` configured against your cluster
- [ingress-nginx](https://kubernetes.github.io/ingress-nginx/) controller installed
- [cert-manager](https://cert-manager.io/) installed (for automatic TLS)
- A domain pointed at your cluster's ingress IP

## Directory Layout

```
k8s/
├── kustomization.yaml          # Kustomize entry point (apply this)
├── namespace.yaml              # delerium namespace
├── ingress.yaml                # Ingress + TLS (replace domain)
├── network-policy.yaml         # Pod-to-pod traffic restrictions
├── pdb.yaml                    # PodDisruptionBudgets
├── server/
│   ├── deployment.yaml         # Kotlin/Ktor backend (replicas: 1, SQLite)
│   ├── service.yaml            # ClusterIP on port 8080
│   ├── pvc.yaml                # 5 Gi PersistentVolumeClaim for SQLite data
│   └── secret.yaml             # Secret template — fill in before applying
├── web/
│   ├── deployment.yaml         # Nginx static frontend + API proxy
│   ├── service.yaml            # NodePort on port 80 (nodePort: 30080)
│   └── configmap.yaml          # nginx.conf (proxies /api/ to the server service)
└── cert-manager/
    └── cluster-issuer.yaml     # Let's Encrypt staging + prod ClusterIssuers
```

## Quick Deploy

```bash
# 1. Install cert-manager (skip if already installed)
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml
kubectl wait --namespace cert-manager --for=condition=Ready pod --all --timeout=120s

# 2. Create ClusterIssuers (once per cluster)
#    Edit k8s/cert-manager/cluster-issuer.yaml — replace REPLACE_WITH_YOUR_EMAIL
kubectl apply -f k8s/cert-manager/cluster-issuer.yaml

# 3. Set the secret
#    Edit k8s/server/secret.yaml — replace the placeholder with a real pepper value:
#      openssl rand -hex 32
kubectl apply -f k8s/server/secret.yaml

# 4. Set your domain
#    Edit k8s/ingress.yaml — replace "paste.example.com" (2 occurrences)

# 5. Apply everything else
kubectl apply -k k8s/
```

After a minute or two `kubectl get pods -n delerium` should show both pods Running.

## Step-by-Step Walkthrough

### 1. cert-manager

cert-manager automates TLS certificate issuance via Let's Encrypt.

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml
kubectl wait --namespace cert-manager --for=condition=Ready pod --all --timeout=120s
```

### 2. ClusterIssuers

Edit `k8s/cert-manager/cluster-issuer.yaml` and replace both occurrences of
`REPLACE_WITH_YOUR_EMAIL` with your email address, then:

```bash
kubectl apply -f k8s/cert-manager/cluster-issuer.yaml
```

Two issuers are created: `letsencrypt-staging` (no rate limits, untrusted cert)
and `letsencrypt-prod` (trusted, rate-limited). **Always test with staging first.**

### 3. Secret

Generate a random pepper and edit `k8s/server/secret.yaml`:

```bash
openssl rand -hex 32
# Paste the output into secret.yaml as the value of DELETION_TOKEN_PEPPER
kubectl apply -f k8s/server/secret.yaml
```

For production prefer a secrets manager (Sealed Secrets, External Secrets
Operator, etc.) so the plaintext value is never committed to source control.

### 4. Domain

Edit `k8s/ingress.yaml` and replace both occurrences of `paste.example.com`
with your actual domain. The ingress annotation points to `letsencrypt-staging`
by default.

### 5. Apply with Kustomize

```bash
kubectl apply -k k8s/
```

This creates the `delerium` namespace and all resources in dependency order.

### 6. Verify

```bash
kubectl get pods -n delerium
kubectl get ingress -n delerium
kubectl describe certificate delerium-tls -n delerium
```

## TLS Workflow (staging → production)

1. Apply with `cert-manager.io/cluster-issuer: "letsencrypt-staging"` (default).
2. Wait for the certificate to be issued: `kubectl describe certificate delerium-tls -n delerium`.
3. Visit your domain — the browser will warn about an untrusted cert (this is expected for staging).
4. Once the untrusted cert arrives successfully, switch the annotation in `k8s/ingress.yaml`:

   ```yaml
   cert-manager.io/cluster-issuer: "letsencrypt-prod"
   ```

5. Delete the old secret to force renewal, then re-apply:

   ```bash
   kubectl delete secret delerium-tls -n delerium
   kubectl apply -k k8s/
   ```

## Architecture

```
Internet → ingress-nginx (port 443/80)
             │  TLS terminated by ingress
             ▼
         delerium-web (nginx, port 80)
             │  proxies /api/* requests
             ▼
         delerium-server (Ktor, port 8080)
             │  reads/writes
             ▼
         PersistentVolume (/data/pastes.db)
```

### Network Policies

`k8s/network-policy.yaml` enforces least-privilege pod communication:

| Source | Destination | Port |
|--------|-------------|------|
| ingress-nginx namespace | delerium-web | 80 |
| delerium-web | delerium-server | 8080 |
| (everything else) | (blocked) | — |

Requires a CNI that enforces NetworkPolicy (Calico, Cilium, Weave, etc.).

### SQLite Constraint

The server deployment uses `strategy: Recreate` and `replicas: 1`. SQLite does
not support concurrent writers — do not increase replicas without first
migrating to a client-server database.

### PodDisruptionBudgets

Both workloads have PDBs with `maxUnavailable: 1`, allowing node drains and
cluster upgrades without blocking eviction.

## Updating to a New Image Version

Edit the `image:` tag in `k8s/server/deployment.yaml` and/or
`k8s/web/deployment.yaml`, then re-apply:

```bash
kubectl apply -k k8s/
# Server uses Recreate strategy — old pod stops before new one starts
kubectl rollout status deployment/delerium-server -n delerium
kubectl rollout status deployment/delerium-web -n delerium
```

## Backup

The SQLite database lives on the PVC mounted at `/data`. Back it up with:

```bash
kubectl exec -n delerium deployment/delerium-server -- \
  sqlite3 /data/pastes.db ".backup /tmp/pastes-backup.db"
kubectl cp delerium/$(kubectl get pod -n delerium -l app=delerium-server -o jsonpath='{.items[0].metadata.name}'):/tmp/pastes-backup.db ./pastes-backup.db
```

Or use a volume snapshot if your storage class supports it.

## Local Development (Docker Desktop)

For local development on Docker Desktop, the web service is exposed as a NodePort
on port 30080, so you don't need `kubectl port-forward` (which drops on sleep/restart).

### Quick Start

```bash
make k8s-local
```

This installs the ingress-nginx controller, applies all manifests, and prints
access instructions.

### Access Methods

**NodePort (always works, no extra config):**

```bash
curl http://localhost:30080/api/health
```

Open <http://localhost:30080> in your browser.

**Ingress with hostname (realistic, matches production):**

1. Add a `/etc/hosts` entry:

   ```
   127.0.0.1 test.delerium.cc
   ```

2. Install the ingress-nginx controller (already done by `make k8s-local`):

   ```bash
   make k8s-install-ingress
   ```

3. Apply manifests:

   ```bash
   make k8s-apply
   ```

4. Access via hostname:

   ```bash
   curl http://test.delerium.cc/api/health
   ```

Both methods survive Mac sleep/wake cycles — no need to restart port-forward.

## Troubleshooting

| Symptom | Steps |
|---------|-------|
| Pods not starting | `kubectl describe pod -n delerium <pod>` — check events |
| Server pod `CrashLoopBackOff` | Check logs: `kubectl logs -n delerium deployment/delerium-server` |
| 502/504 from ingress | Verify web pod is running; check nginx proxy config in ConfigMap |
| Certificate stuck `Pending` | `kubectl describe certificaterequest -n delerium` — check ACME challenge; verify DNS |
| Staging cert, need production | Follow TLS workflow above to switch ClusterIssuer and delete old secret |
| PVC `Pending` | Cluster may lack a default StorageClass; set `storageClassName` in `k8s/server/pvc.yaml` |
| NetworkPolicy blocking traffic | Verify your CNI supports NetworkPolicy; check CNI namespace labels match `ingress.yaml` |
