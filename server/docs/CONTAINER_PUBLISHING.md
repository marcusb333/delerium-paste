# Container Image Publishing Guide

This guide explains how to publish the delerium-paste as a reusable container image to Docker Hub or GitHub Container Registry (GHCR).

## Quick Start

**For GitHub Container Registry (GHCR) - Easiest Option:**

- ✅ **No setup required!** Just push to your GitHub repository
- Images are automatically published to `ghcr.io/<your-username>/delerium-paste`
- Works immediately - no secrets to configure

**For Docker Hub:**

- Requires setting up secrets in GitHub (see below)
- Images published to `docker.io/<your-username>/delerium-paste`

## Prerequisites

1. **Docker** installed and running (for local builds)
2. **GitHub repository** (for automated publishing via Actions)
3. **Docker Hub account** (optional, only if publishing to Docker Hub)

## Automated Publishing (Recommended)

### GitHub Container Registry (GHCR)

**Zero configuration required!**

1. **Push to your repository:**

   ```bash
   git push origin main
   ```

   This automatically builds and pushes:
   - `ghcr.io/<your-username>/delerium-paste:latest`

2. **Create a version tag:**

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

   This automatically creates multiple tags:
   - `ghcr.io/<your-username>/delerium-paste:1.0.0`
   - `ghcr.io/<your-username>/delerium-paste:1.0`
   - `ghcr.io/<your-username>/delerium-paste:1`
   - `ghcr.io/<your-username>/delerium-paste:latest`

3. **View your images:**
   - Go to your GitHub repository → Packages (right sidebar)
   - Or visit: `https://github.com/<your-username>?tab=packages`

**Note:** By default, packages are private. To make them public:

- Go to the package page → Package settings → Change visibility → Make public

### Docker Hub

1. **Set up Docker Hub secrets in GitHub:**
   - Go to your repository → Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Add the following secrets:
     - **Name:** `DOCKERHUB_USERNAME` → **Value:** Your Docker Hub username
     - **Name:** `DOCKERHUB_TOKEN` → **Value:** Your Docker Hub access token
       - Create token at: <https://hub.docker.com/settings/security>
       - Click "New Access Token"
       - Give it a description (e.g., "GitHub Actions")
       - Copy the token immediately (you won't see it again!)

2. **Trigger the workflow:**
   - **Push to `main` branch:**

     ```bash
     git push origin main
     ```

     Builds and pushes: `your-username/delerium-paste:latest`

   - **Create a version tag:**

     ```bash
     git tag v1.0.0
     git push origin v1.0.0
     ```

     Builds and pushes multiple tags:
     - `your-username/delerium-paste:1.0.0`
     - `your-username/delerium-paste:1.0`
     - `your-username/delerium-paste:1`
     - `your-username/delerium-paste:latest`

3. **Verify the workflow:**
   - Go to your repository → Actions tab
   - You should see "Build and Push Docker Image" workflow running
   - Once complete, check Docker Hub: <https://hub.docker.com/r/your-username/delerium-paste>

## Manual Publishing

### Using the Build Script

The project includes `docker-build.sh` for easy local builds:

**For Docker Hub:**

```bash
cd server  # Navigate to server directory in monorepo
./docker-build.sh 1.0.0 dockerhub your-dockerhub-username
docker login
docker push your-dockerhub-username/delerium-paste:1.0.0
docker push your-dockerhub-username/delerium-paste:latest
```

**For GHCR:**

```bash
cd server  # Navigate to server directory in monorepo
./docker-build.sh 1.0.0 ghcr your-github-username
echo $GITHUB_TOKEN | docker login ghcr.io -u your-github-username --password-stdin
docker push ghcr.io/your-github-username/delerium-paste:1.0.0
docker push ghcr.io/your-github-username/delerium-paste:latest
```

**Note:** For GHCR, create a GitHub Personal Access Token with `write:packages` permission at <https://github.com/settings/tokens>

### Multi-Architecture Builds

To build for multiple architectures locally, use Docker Buildx:

```bash
# Create and use a new builder instance (first time only)
docker buildx create --name multiarch --use

# Build for multiple platforms
docker buildx build \
  --platform linux/amd64,linux/arm64,linux/arm/v7 \
  -t your-username/delerium-paste:latest \
  --push \
  .
```

### Direct Docker Build

**For Docker Hub:**

```bash
cd server  # Navigate to server directory in monorepo
docker build -t your-username/delerium-paste:1.0.0 .
docker tag your-username/delerium-paste:1.0.0 your-username/delerium-paste:latest
docker login
docker push your-username/delerium-paste:1.0.0
docker push your-username/delerium-paste:latest
```

**For GHCR:**

```bash
cd server  # Navigate to server directory in monorepo
docker build -t ghcr.io/your-username/delerium-paste:1.0.0 .
docker tag ghcr.io/your-username/delerium-paste:1.0.0 ghcr.io/your-username/delerium-paste:latest
echo $GITHUB_TOKEN | docker login ghcr.io -u your-username --password-stdin
docker push ghcr.io/your-username/delerium-paste:1.0.0
docker push ghcr.io/your-username/delerium-paste:latest
```

## CI/CD Workflow Details

The GitHub Actions workflow (`.github/workflows/server-ci.yml`) automatically:

- **Builds images** on pushes to `main` and version tags (format: `v*`)
- **Multi-architecture builds** for amd64, arm64, and arm/v7
- **Creates multiple tags** for semantic versioning (e.g., `1.0.0`, `1.0`, `1`, `latest`)
- **Uses build cache** for faster builds (GitHub Actions cache)
- **Build attestation** for supply chain security
- **Security scanning** with OWASP Dependency Check
- **Publishes to registries** (if configured):
  - GHCR: Always enabled (uses `GITHUB_TOKEN`)
  - Docker Hub: Only if `DOCKERHUB_TOKEN` secret is set
- **Builds only** on pull requests (doesn't push)
- **Path filtering** - only triggers on server code changes (`server/**`)

### Workflow Triggers

- **Push to `main` branch:** Builds and pushes `latest` tag
- **Push version tag (`v*`):** Builds and pushes versioned tags
- **Pull requests:** Builds only (for testing), doesn't push

### Registry Behavior

- **GHCR:** Always publishes (no secrets needed)
- **Docker Hub:** Only publishes if `DOCKERHUB_USERNAME` secret exists

### Customizing the Workflow

To modify the workflow:

1. Edit `.github/workflows/docker-publish.yml`
2. Adjust triggers, registries, or tags as needed
3. Update secrets if switching registries
4. To disable a registry, comment out or remove the relevant steps

## Image Details

### Base Images

- **Builder**: `eclipse-temurin:25-jdk-jammy` with Bazelisk (Bazel build system)
- **Runtime**: `eclipse-temurin:25-jre-jammy` (JRE only, smaller size)

### Multi-Architecture Support

The Docker image supports multiple architectures:

- `linux/amd64` (x86_64)
- `linux/arm64` (ARM 64-bit, Apple Silicon, AWS Graviton)
- `linux/arm/v7` (ARM 32-bit, Raspberry Pi)

This allows deployment on a wide range of platforms including:

- Traditional x86_64 servers
- Apple Silicon Macs (M1/M2/M3)
- ARM-based cloud instances (AWS Graviton, Oracle Cloud)
- Raspberry Pi and other ARM devices

### Security Features

The Docker image includes several security enhancements:

- **Non-root user**: Application runs as `delirium:delirium` (uid/gid 999)
- **Health checks**: Built-in health monitoring via `/health` endpoint
- **OCI labels**: Standard container metadata for better tooling support
- **Minimal attack surface**: JRE-only runtime image (no build tools)

### Image Size

The multi-stage build produces a minimal runtime image containing only:

- JRE 25
- Application binaries
- Application dependencies

### Security Considerations

1. **Non-root user**:
   - The container runs as user `delirium` (uid/gid 999) for enhanced security
   - The `/data` directory is automatically configured with correct permissions
   - If mounting a volume, ensure the host directory is readable/writable by uid 999

2. **Pepper management**:
   - **Auto-generation**: If `DELETION_TOKEN_PEPPER` is not set, the application automatically generates a cryptographically secure random pepper (32 bytes)
   - **Production best practice**: Set `DELETION_TOKEN_PEPPER` explicitly for consistency across restarts
     - If the pepper changes between restarts, deletion tokens created before the restart will be invalid
     - Generate a secure value: `openssl rand -hex 32`

3. **Volume permissions**:
   - With the non-root user, ensure host-mounted volumes are accessible
   - Option 1: `chown -R 999:999 /path/to/data` on the host
   - Option 2: Use Docker-managed volumes (recommended)

4. **Health checks**:
   - Built-in health check monitors the `/health` endpoint
   - Interval: 30s, Timeout: 10s, Start period: 40s, Retries: 3
   - Used by orchestrators (Docker Compose, Kubernetes) for automated restarts

5. **Network security**: For TLS termination, consider using a reverse proxy (nginx, traefik) or a Kubernetes ingress controller in front of the container

6. **Secrets management**: Use Docker secrets or environment variable management tools in production

## Troubleshooting

### Container won't start

- Check logs: `docker logs <container-id>`
- Verify database path is writable: `docker exec <container-id> ls -la /data`
- Ensure `DELETION_TOKEN_PEPPER` is set (or allow auto-generation)

### Database issues

- Ensure `/data` volume is mounted and writable
- Check file permissions on the host directory
- Verify SQLite is working: `docker exec <container-id> sqlite3 /data/pastes.db ".tables"`

### Build failures

- Ensure Docker has enough resources (memory, disk space)
- Check network connectivity for downloading dependencies
- Review build logs for specific errors

## Quick Reference

### Automated Publishing

**GHCR (Zero Setup):**

```bash
git push origin main                    # Pushes latest tag
git tag v1.0.0 && git push origin v1.0.0  # Pushes versioned tags
```

**Docker Hub (Requires Secrets):**

1. Add `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` secrets in GitHub
2. Same git commands as above

### Manual Publishing

**GHCR:**

```bash
./docker-build.sh 1.0.0 ghcr your-github-username
echo $GITHUB_TOKEN | docker login ghcr.io -u your-github-username --password-stdin
docker push ghcr.io/your-github-username/delerium-paste:1.0.0
```

**Docker Hub:**

```bash
./docker-build.sh 1.0.0 dockerhub your-dockerhub-username
docker login
docker push your-dockerhub-username/delerium-paste:1.0.0
```

### Pull and Run Published Images

**From GHCR:**

```bash
docker pull ghcr.io/your-username/delerium-paste:latest
docker run -d -p 8080:8080 -v ./data:/data -e DELETION_TOKEN_PEPPER=your-secret ghcr.io/your-username/delerium-paste:latest
```

**From Docker Hub:**

```bash
docker pull your-username/delerium-paste:latest
docker run -d -p 8080:8080 -v ./data:/data -e DELETION_TOKEN_PEPPER=your-secret your-username/delerium-paste:latest
```

## Best Practices

1. **Versioning**: Use semantic versioning (e.g., `v1.0.0`) for releases
2. **Tagging**: Always tag releases, use `latest` for the current stable version
3. **Security**: Regularly update base images and dependencies
4. **Testing**: Test images locally before pushing to registries
5. **Documentation**: Keep this guide and README updated with usage examples
