# Consolidate Server + Web into Single Docker Image

## Context

Currently the app runs two containers: a Ktor API server and an Nginx container that serves static files and reverse-proxies to the API. This adds deployment complexity (two images, two services, nginx config management) for minimal benefit at this scale. We consolidate into a single container where Ktor serves both the API and static frontend files.

## Design

### Ktor Static File Serving

Add Ktor `staticFiles` routing to serve compiled client assets from a configurable directory path (not classpath resources). Default: `/app/static/`.

```kotlin
routing {
    staticFiles("/", File(staticDir)) {
        default("index.html")  // SPA fallback
        extensions("html")
    }
    route("/api") { /* existing API routes */ }
}
```

- Static file directory configurable via `application.conf`: `app.staticDir = "/app/static/"`
- In dev, docker-compose mounts `./client/` to `/app/static/` for hot-reload
- In prod, files are baked into the image at build time

### Cache Headers

Add an interceptor for static assets:
- `*.js`, `*.css`: `Cache-Control: public, max-age=31536000, immutable`
- `*.html`: `Cache-Control: no-cache` (always revalidate)
- Everything else: `Cache-Control: public, max-age=3600`

### Health Endpoint

Add `/health` (non-API) returning 200 — replaces Nginx's health check. Keep `/api/health` as-is.

### Consolidated Dockerfile

Multi-stage build:
1. **Stage 1 (node:20-alpine):** `npm ci && npm run build` — compile TypeScript
2. **Stage 2 (eclipse-temurin:25-jdk):** Bazel build — compile Kotlin server
3. **Stage 3 (eclipse-temurin:25-jre):** Copy server JARs + compiled static files into `/app/static/`

### Docker Compose Changes

**docker-compose.yml:** Remove `web` service. Server gets port 80 (or 8080 with port mapping).

**docker-compose.dev.yml:** Mount `./client/` to `/app/static/` on server container. Remove web overrides.

**docker-compose.prod.yml:** Remove web image reference. Single server image only.

### K8s Changes

**Remove:** `k8s/web/` directory (deployment, service, configmap), web PDB, web network policies.

**Update:**
- `k8s/ingress.yaml`: Point to `delerium-server:8080` instead of `delerium-web:80`
- `k8s/network-policy.yaml`: Simplify to ingress-controller -> server:8080
- `k8s/kustomization.yaml`: Remove web resource references

### CI Workflow

`auto-release.yml`: Build and push only `marcusb333/delerium-server:latest`.

### What We Keep

- All security headers (already in Ktor's App.kt)
- Rate limiting (already in Ktor)
- Compression (already in Ktor)
- CSP headers (already in Ktor)

### What We Drop

- Nginx-level rate limiting (redundant with Ktor's)
- Nginx-level security headers (redundant with Ktor's)
- SSL/TLS termination in Nginx (handled by K8s ingress controller or cloud LB)

## Files to Modify

1. `server/src/main/kotlin/App.kt` — add static file serving, cache headers, `/health`
2. `server/src/main/resources/application.conf` — add `app.staticDir`
3. `server/BUILD.bazel` — may need ktor-server-static-content dependency
4. `server/Dockerfile` — multi-stage with Node + Bazel + JRE
5. `docker-compose.yml` — remove web service
6. `docker-compose.dev.yml` — mount client/ to /app/static/
7. `docker-compose.prod.yml` — remove web image
8. `k8s/ingress.yaml` — point to server
9. `k8s/network-policy.yaml` — simplify
10. `k8s/pdb.yaml` — remove web PDB
11. `k8s/kustomization.yaml` — remove web resources
12. `.github/workflows/auto-release.yml` — single image build
13. `web/Dockerfile` — delete
14. `k8s/web/` — delete directory

## Verification

1. `make dev` — static files served at localhost, API works, hot-reload with mounted volume
2. `make test` — all client tests pass
3. `make build-server-bazel` — server builds with new static file deps
4. Docker build succeeds and serves both static + API
5. K8s manifests apply cleanly with `kubectl apply -k k8s/`
