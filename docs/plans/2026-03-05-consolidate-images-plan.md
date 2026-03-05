# Consolidate Server + Web into Single Image — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Merge the separate Nginx web container and Ktor server container into a single Docker image where Ktor serves both the API and static frontend files.

**Architecture:** Ktor serves static files from a configurable filesystem directory (`/app/static/`) using `staticFiles()`. In dev, the client directory is volume-mounted for hot-reload. In production, compiled client assets are baked into the image via a multi-stage Docker build.

**Tech Stack:** Ktor 3.2.0 (`ktor-server-host-common-jvm` for static file serving), Node 20 (client build), Bazel (server build), Docker multi-stage, Kubernetes

---

### Task 1: Add Ktor static file serving dependency

**Files:**
- Modify: `MODULE.bazel:25-57` (add ktor-server-host-common-jvm)
- Modify: `server/BUILD.bazel:13-33` (add dep to library)

**Step 1: Add Maven dependency to MODULE.bazel**

Add after line 33 (after `ktor-server-status-pages-jvm`):
```
        "io.ktor:ktor-server-host-common-jvm:3.2.0",
```

**Step 2: Add Bazel dep to server/BUILD.bazel**

Add to the `deps` list in the `delerium_server_lib` target:
```
        "@maven//:io_ktor_ktor_server_host_common_jvm",
```

**Step 3: Verify Bazel resolves**

Run: `cd /Users/marcusb/src/repos/delerium-paste && bazel build //server:delerium_server_lib`
Expected: BUILD SUCCESS

**Step 4: Commit**

```bash
git add MODULE.bazel server/BUILD.bazel
git commit -m "chore: add ktor-server-host-common dependency for static file serving"
```

---

### Task 2: Add static file serving and /health to Ktor

**Files:**
- Modify: `server/src/main/kotlin/App.kt`
- Modify: `server/src/main/resources/application.conf`

**Step 1: Add staticDir to application.conf**

Add after the `ktor` block (line 4):
```hocon
app {
  staticDir = "/app/static"
  staticDir = ${?STATIC_DIR}
}
```

**Step 2: Add imports to App.kt**

Add these imports at the top of App.kt:
```kotlin
import io.ktor.http.CacheControl
import io.ktor.http.content.CachingOptions
import io.ktor.server.http.content.staticFiles
import io.ktor.server.http.content.default
import io.ktor.server.http.content.cacheControl
import io.ktor.server.response.respondText
import io.ktor.http.ContentType
import java.io.File
```

**Step 3: Read staticDir config in module()**

Add after `val appCfg = AppConfig(...)` block (around line 143):
```kotlin
val staticDir = System.getenv("STATIC_DIR")
    ?: cfg.propertyOrNull("app.staticDir")?.getString()
    ?: "/app/static"
```

**Step 4: Add static file serving and /health to routing block**

Replace the existing `routing { ... }` block (lines 260-262) with:
```kotlin
routing {
    // Health check (non-API, for load balancers/probes)
    get("/health") {
        call.respondText("OK", ContentType.Text.Plain)
    }

    // API routes
    apiRoutes(repo, rl, pow, appCfg, failedAttemptTracker)

    // Static files (served from filesystem directory)
    val staticRoot = File(staticDir)
    if (staticRoot.isDirectory) {
        staticFiles("/", staticRoot) {
            default("index.html")
            cacheControl { url ->
                when {
                    url.path.endsWith(".js") -> listOf(CacheControl.MaxAge(maxAgeSeconds = 31536000, visibility = CacheControl.Visibility.Public))
                    url.path.endsWith(".css") -> listOf(CacheControl.MaxAge(maxAgeSeconds = 31536000, visibility = CacheControl.Visibility.Public))
                    url.path.endsWith(".html") -> listOf(CacheControl.NoCache(null))
                    else -> listOf(CacheControl.MaxAge(maxAgeSeconds = 3600, visibility = CacheControl.Visibility.Public))
                }
            }
        }
    }
}
```

**Step 5: Build and verify**

Run: `bazel build //server:delerium_server_lib`
Expected: BUILD SUCCESS

**Step 6: Commit**

```bash
git add server/src/main/kotlin/App.kt server/src/main/resources/application.conf
git commit -m "feat: add static file serving and /health endpoint to Ktor"
```

---

### Task 3: Consolidate Dockerfile

**Files:**
- Modify: `server/Dockerfile` (rewrite to multi-stage with Node + Bazel + JRE)

**Step 1: Rewrite server/Dockerfile**

```dockerfile
# ---- Stage 1: Build client ----
FROM node:20-alpine AS client-builder
WORKDIR /build
COPY client/package*.json ./
RUN npm ci --ignore-scripts
COPY client/ ./
RUN npm run build

# ---- Stage 2: Build server ----
FROM eclipse-temurin:25-jdk-jammy AS server-builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl ca-certificates git build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN ARCH=$(uname -m) && \
    case $ARCH in \
        x86_64) BAZELISK_ARCH="amd64" ;; \
        aarch64|arm64) BAZELISK_ARCH="arm64" ;; \
        *) echo "Unsupported architecture: $ARCH"; exit 1 ;; \
    esac && \
    curl -LO "https://github.com/bazelbuild/bazelisk/releases/download/v1.28.1/bazelisk-linux-${BAZELISK_ARCH}" && \
    chmod +x "bazelisk-linux-${BAZELISK_ARCH}" && \
    mv "bazelisk-linux-${BAZELISK_ARCH}" /usr/local/bin/bazel

ENV USE_BAZEL_VERSION=8.5.1
ENV BAZELISK_SKIP_WRAPPER=0

RUN groupadd -r builder && \
    useradd -r -g builder -m builder && \
    chown -R builder:builder /usr/local/bin/bazel

WORKDIR /build

COPY --chown=builder:builder MODULE.bazel MODULE.bazel.lock WORKSPACE .bazelrc .bazelversion .bazelignore ./
COPY --chown=builder:builder server/ ./server/

RUN chown -R builder:builder /build

USER builder
RUN bazel --batch build //server:delerium_server_deploy --config=ci

USER root
RUN mkdir -p /app/lib && \
    cd /build && \
    if [ -d bazel-bin/server/delerium_server_deploy.runfiles ]; then \
        find bazel-bin/server/delerium_server_deploy.runfiles -name "*.jar" -exec cp {} /app/lib/ \; ; \
    fi && \
    if [ -f bazel-bin/server/delerium_server_lib.jar ]; then \
        cp bazel-bin/server/delerium_server_lib.jar /app/lib/ ; \
    fi && \
    if [ -f bazel-bin/server/delerium_server_lib-resources.jar ]; then \
        cp bazel-bin/server/delerium_server_lib-resources.jar /app/lib/ ; \
    fi && \
    if [ -f bazel-bin/server/delerium_server_deploy.jar ]; then \
        cp bazel-bin/server/delerium_server_deploy.jar /app/lib/ ; \
    fi

# ---- Stage 3: Runtime ----
FROM eclipse-temurin:25-jre-jammy

LABEL org.opencontainers.image.title="Delirium Paste"
LABEL org.opencontainers.image.description="Zero-knowledge encrypted paste service"
LABEL org.opencontainers.image.source="https://github.com/marcusb333/delerium-paste"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.base.name="eclipse-temurin:25-jre-jammy"

RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y --no-install-recommends curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy server JARs
COPY --from=server-builder /app/ /app/

# Copy compiled client assets
COPY --from=client-builder /build/index.html   /app/static/
COPY --from=client-builder /build/view.html    /app/static/
COPY --from=client-builder /build/delete.html  /app/static/
COPY --from=client-builder /build/favicon.svg  /app/static/
COPY --from=client-builder /build/js/          /app/static/js/
COPY --from=client-builder /build/styles/      /app/static/styles/
COPY --from=client-builder /build/vendor/      /app/static/vendor/

RUN groupadd -r delirium && \
    useradd -r -g delirium delirium && \
    chown -R delirium:delirium /app

USER delirium

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

ENTRYPOINT ["sh", "-c", "java -cp '/app/lib/*' io.ktor.server.netty.EngineMain"]
```

**Step 2: Commit**

```bash
git add server/Dockerfile
git commit -m "feat: consolidate client and server into single multi-stage Dockerfile"
```

---

### Task 4: Update Docker Compose files

**Files:**
- Modify: `docker-compose.yml` (remove web service, expose server port 80->8080)
- Modify: `docker-compose.dev.yml` (mount client/ to /app/static/, remove web overrides)
- Modify: `docker-compose.prod.yml` (remove web image)

**Step 1: Update docker-compose.yml**

Remove the entire `web:` service block (lines 57-79). Update the `server:` service:
- Change `expose: - "8080"` to `ports: - "80:8080"`
- Remove `depends_on` on web if present

**Step 2: Update docker-compose.dev.yml**

Remove all `web:` overrides. Add to the `server:` service:
```yaml
    volumes:
      - ./client:/app/static:ro
    environment:
      - STATIC_DIR=/app/static
```

**Step 3: Update docker-compose.prod.yml**

Remove the `web:` service block entirely. Keep only `server:` with its production image tag.

**Step 4: Commit**

```bash
git add docker-compose.yml docker-compose.dev.yml docker-compose.prod.yml
git commit -m "feat: remove web service from Docker Compose, server serves everything"
```

---

### Task 5: Update K8s manifests

**Files:**
- Delete: `k8s/web/deployment.yaml`
- Delete: `k8s/web/service.yaml`
- Delete: `k8s/web/configmap.yaml`
- Modify: `k8s/kustomization.yaml` (remove web resources)
- Modify: `k8s/ingress.yaml` (point to delerium-server:8080)
- Modify: `k8s/network-policy.yaml` (simplify: ingress-controller -> server:8080)
- Modify: `k8s/pdb.yaml` (remove web PDB)

**Step 1: Remove web K8s resources from kustomization.yaml**

Remove these lines:
```yaml
  - web/configmap.yaml
  - web/deployment.yaml
  - web/service.yaml
```

**Step 2: Update ingress.yaml**

Change the backend from `delerium-web:80` to `delerium-server:8080`:
```yaml
            backend:
              service:
                name: delerium-server
                port:
                  number: 8080
```

**Step 3: Simplify network-policy.yaml**

Replace the entire file with two policies:
1. Allow ingress-controller -> server:8080
2. Allow server -> postgres egress (if needed)

Remove all three existing policies and replace with:
```yaml
# Allow the ingress controller to reach the server pod on port 8080.
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: delerium-server-ingress
  namespace: delerium
spec:
  podSelector:
    matchLabels:
      app: delerium-server
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ingress-nginx
      ports:
        - protocol: TCP
          port: 8080
```

**Step 4: Remove web PDB from pdb.yaml**

Remove the `delerium-web-pdb` block (lines 8-17), keeping only the server PDB.

**Step 5: Delete web directory**

```bash
rm -rf k8s/web/
```

**Step 6: Commit**

```bash
git add -A k8s/
git commit -m "feat: simplify K8s manifests — remove web deployment, point ingress to server"
```

---

### Task 6: Update CI workflow

**Files:**
- Modify: `.github/workflows/auto-release.yml` (single image build)

**Step 1: Update auto-release.yml**

Remove the "Build and push web image" step entirely. Update the server build step context to `.` (already correct). Remove the web Dockerfile reference.

The file should have only one `docker/build-push-action` step for `marcusb333/delerium-server:latest`.

**Step 2: Commit**

```bash
git add .github/workflows/auto-release.yml
git commit -m "chore: update CI to build single consolidated Docker image"
```

---

### Task 7: Delete web/Dockerfile

**Files:**
- Delete: `web/Dockerfile`

**Step 1: Delete the file**

```bash
rm web/Dockerfile
```

If `web/` directory is now empty, delete it:
```bash
rmdir web/ 2>/dev/null || true
```

**Step 2: Commit**

```bash
git add -A web/
git commit -m "chore: remove web Dockerfile — frontend now served by server"
```

---

### Task 8: Update Makefile targets (if needed)

**Files:**
- Modify: `Makefile` (remove web-specific targets, update dev/start targets)

**Step 1: Check and update Makefile**

Review Makefile for any targets that reference the `web` service or `web/Dockerfile`. Update `make dev`, `make start`, `make build-client` targets as needed.

**Step 2: Commit if changes made**

```bash
git add Makefile
git commit -m "chore: update Makefile targets for single-image architecture"
```

---

### Task 9: Verify end-to-end

**Step 1: Build Docker image**

Run: `docker compose build server`
Expected: Multi-stage build succeeds, client compiled, server compiled, image created.

**Step 2: Start services**

Run: `docker compose up -d`
Expected: Only postgres + server containers running. No web container.

**Step 3: Verify static files**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost/`
Expected: `200` (index.html served)

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost/view.html`
Expected: `200`

**Step 4: Verify API**

Run: `curl -s http://localhost/api/health`
Expected: Health check response

**Step 5: Verify /health**

Run: `curl -s http://localhost/health`
Expected: `OK`

**Step 6: Verify cache headers**

Run: `curl -sI http://localhost/js/app.js | grep -i cache`
Expected: `Cache-Control: public, max-age=31536000`

**Step 7: Run client tests**

Run: `make test`
Expected: All tests pass, 85%+ coverage

**Step 8: Verify K8s manifests are valid**

Run: `kubectl apply -k k8s/ --dry-run=client`
Expected: No errors
