# Multi-Architecture Docker Deployment

This guide explains how to build and deploy Delirium Paste Mono for multiple CPU architectures (amd64 and arm64).

## Overview

Delirium Paste Mono supports multi-architecture Docker deployments, allowing you to run the application on:

- **AMD64/x86_64**: Traditional Intel/AMD processors (most cloud providers, desktops)
- **ARM64/aarch64**: ARM-based processors (Apple Silicon, Raspberry Pi 4/5, AWS Graviton, etc.)

## Supported Architectures

| Architecture | Platform | Common Devices |
|-------------|----------|----------------|
| `linux/amd64` | x86_64 | Intel/AMD servers, most cloud VMs, traditional desktops |
| `linux/arm64` | aarch64 | Apple Silicon (M1/M2/M3), Raspberry Pi 4/5, AWS Graviton |

## Prerequisites

### For Local Multi-Arch Builds

1. **Docker Desktop** (macOS/Windows) or **Docker Engine 19.03+** (Linux)
2. **Docker Buildx** (included in Docker Desktop, may need manual setup on Linux)
3. **QEMU** (for cross-platform emulation)

#### Setup on Linux

```bash
# Install QEMU for cross-platform builds
sudo apt-get update
sudo apt-get install -y qemu-user-static binfmt-support

# Enable buildx (if not already enabled)
docker buildx create --name multiarch-builder --use
docker buildx inspect --bootstrap
```

#### Setup on macOS/Windows

Docker Desktop includes buildx and QEMU by default. No additional setup required.

## Building Multi-Architecture Images

### Method 1: Using Make (Recommended)

#### Local Build (for testing)

```bash
# Build multi-arch images locally
make build-multiarch
```

This creates images for both amd64 and arm64 architectures tagged as:

- `delerium-server:latest`
- `delerium-server:multi-arch`

#### Push to Registry

```bash
# Push to GitHub Container Registry
make push-multiarch REGISTRY=ghcr.io/yourusername TAG=v1.0.0

# Push to Docker Hub
make push-multiarch REGISTRY=docker.io/yourusername TAG=v1.0.0

# Push with custom tag
make push-multiarch REGISTRY=ghcr.io/yourusername TAG=latest
```

### Method 2: Using Docker Buildx Directly

```bash
# Create and use a builder
docker buildx create --name delirium-builder --use

# Build for multiple platforms
cd server
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag ghcr.io/yourusername/delerium-server:latest \
  --push \
  .
```

### Method 3: Using Docker Compose

Docker Compose builds for the host architecture by default:

```bash
# Build with docker compose (builds for your current architecture)
docker compose build

# Start services
docker compose up -d
```

**Note**: Docker Compose does not support multi-arch builds natively. For multi-architecture images, use Docker Buildx (Method 1 or 2) to build and push to a registry, then pull from the registry in your docker-compose deployment.

## Deployment

### Automatic Platform Selection

When you pull and run the image, Docker automatically selects the correct architecture:

```bash
# Pull the image (automatically selects your platform)
docker pull ghcr.io/yourusername/delerium-server:latest

# Run with docker compose (uses correct architecture)
docker compose up -d
```

### Explicit Platform Selection

You can explicitly specify the platform:

```bash
# Run on ARM64 explicitly
docker run --platform linux/arm64 ghcr.io/yourusername/delerium-server:latest

# Run on AMD64 explicitly
docker run --platform linux/amd64 ghcr.io/yourusername/delerium-server:latest
```

### Platform-Specific Compose Override

If you need to force a specific platform in docker-compose:

```yaml
# docker-compose.override.yml
services:
  server:
    platform: linux/arm64  # or linux/amd64
```

## CI/CD Integration

### GitHub Actions

The repository uses `.github/workflows/deploy.yml` to automatically build and push the server image when a git tag is pushed.

#### Workflow: `deploy.yml`

Triggers on: git tags matching `v*`

Builds for: `linux/amd64` (single-arch, native runner)

Publishes to Docker Hub:
- `marcusb333/delerium-server:<tag>`
- `marcusb333/delerium-server:latest`

After pushing the image, the workflow calls the VPS webhook to pull and restart the server container automatically. See [AUTO_DEPLOYMENT.md](AUTO_DEPLOYMENT.md) for setup.

> **Note:** The CI workflow currently builds for `linux/amd64` only. For multi-arch
> production images, use `make push-multiarch` locally or extend the workflow with
> `docker/setup-qemu-action` and a `platforms` list.

### Verifying Multi-Arch Images

After building and pushing, verify the architectures:

```bash
# Inspect the manifest
docker buildx imagetools inspect ghcr.io/yourusername/delerium-server:latest

# Output shows available platforms:
# Name:      ghcr.io/yourusername/delerium-server:latest
# MediaType: application/vnd.docker.distribution.manifest.list.v2+json
# Digest:    sha256:...
#
# Manifests:
#   Name:      ghcr.io/yourusername/delerium-server:latest@sha256:...
#   MediaType: application/vnd.docker.distribution.manifest.v2+json
#   Platform:  linux/amd64
#
#   Name:      ghcr.io/yourusername/delerium-server:latest@sha256:...
#   MediaType: application/vnd.docker.distribution.manifest.v2+json
#   Platform:  linux/arm64
```

## Performance Considerations

### Build Time

- **Native builds** (building for your host architecture): Fast
- **Cross-compilation** (building for other architectures): Slower due to QEMU emulation
- **CI/CD builds**: GitHub Actions provides native runners for both amd64 and arm64

### Runtime Performance

- **Native execution**: Full performance (no overhead)
- **Emulated execution**: Significantly slower (not recommended for production)

**Best Practice**: Always deploy images matching your host architecture. The multi-arch manifest ensures Docker automatically selects the correct image.

## Troubleshooting

### Issue: "exec format error"

**Cause**: Running an image built for a different architecture without QEMU.

**Solution**:

```bash
# Install QEMU for cross-platform support
docker run --rm --privileged multiarch/qemu-user-static --reset -p yes

# Or pull the correct architecture explicitly
docker pull --platform linux/amd64 delerium-server:latest
```

### Issue: Buildx not found

**Cause**: Docker Buildx not installed or enabled.

**Solution**:

```bash
# On Linux, install buildx
mkdir -p ~/.docker/cli-plugins
wget -O ~/.docker/cli-plugins/docker-buildx \
  https://github.com/docker/buildx/releases/latest/download/buildx-linux-amd64
chmod +x ~/.docker/cli-plugins/docker-buildx

# Verify
docker buildx version
```

### Issue: Slow multi-arch builds

**Cause**: Cross-compilation using QEMU emulation is inherently slower.

**Solutions**:

1. Use GitHub Actions (provides native runners)
2. Build only for your target architecture during development
3. Use a multi-arch build server with native support for both architectures

### Issue: "multiple platforms feature is currently not supported for docker driver"

**Cause**: Using the default docker driver instead of docker-container driver.

**Solution**:

```bash
# Create a new builder with docker-container driver
docker buildx create --name multiarch-builder --driver docker-container --use
docker buildx inspect --bootstrap
```

## Architecture Detection

The Dockerfile includes build arguments that display the target architecture:

```dockerfile
ARG TARGETPLATFORM
ARG BUILDPLATFORM
ARG TARGETARCH

RUN echo "Building on $BUILDPLATFORM for $TARGETPLATFORM (arch: $TARGETARCH)"
```

Check build logs to verify the correct architecture is being built.

## Best Practices

1. **Always test on target architecture**: Test ARM builds on ARM hardware when possible
2. **Use manifest lists**: Let Docker automatically select the correct architecture
3. **Cache optimization**: Use `--cache-from` and `--cache-to` for faster builds
4. **CI/CD**: Leverage GitHub Actions for automatic multi-arch builds
5. **Version tags**: Tag images with version numbers for reproducible deployments
6. **Security scanning**: Run security scans on all architecture variants

## Example Deployment Scenarios

### Scenario 1: Raspberry Pi 4/5 (ARM64)

```bash
# On your Raspberry Pi
git clone https://github.com/yourusername/delerium-paste.git
cd delerium-paste

# Setup and start (automatically uses ARM64 image)
make quick-start
```

### Scenario 2: Apple Silicon Mac (ARM64)

```bash
# On M1/M2/M3 Mac
git clone https://github.com/yourusername/delerium-paste.git
cd delerium-paste

# Build and run (native ARM64)
make start
```

### Scenario 3: AWS EC2 (AMD64 or ARM64)

```bash
# On EC2 instance (works on both x86 and Graviton)
git clone https://github.com/yourusername/delerium-paste.git
cd delerium-paste

# Setup with security hardening
make start-secure
```

### Scenario 4: Mixed Architecture Cluster

If deploying to Kubernetes or Docker Swarm with mixed architectures:

```yaml
# kubernetes-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: delerium-paste
spec:
  replicas: 3
  selector:
    matchLabels:
      app: delerium-paste
  template:
    metadata:
      labels:
        app: delerium-paste
    spec:
      containers:
      - name: server
        image: ghcr.io/yourusername/delerium-server:latest
        # Docker automatically selects the correct architecture
        ports:
        - containerPort: 8080
```

## Additional Resources

- [Docker Buildx Documentation](https://docs.docker.com/buildx/working-with-buildx/)
- [Multi-platform Images](https://docs.docker.com/build/building/multi-platform/)
- [GitHub Actions for Multi-arch](https://docs.github.com/en/actions/using-github-hosted-runners/about-github-hosted-runners)
- [QEMU User Static](https://github.com/multiarch/qemu-user-static)

## Support Matrix

| Component | AMD64 | ARM64 | Notes |
|-----------|-------|-------|-------|
| Server (Kotlin/JVM) | ✅ | ✅ | Eclipse Temurin JRE 25 supports both |
| Client (Static) | ✅ | ✅ | Architecture-independent (served by Ktor from `/app/static/`) |
| Database (PostgreSQL) | ✅ | ✅ | Official postgres image is multi-arch |

The single `delerium-server` image contains both the Ktor backend and the static
frontend files. There is no separate web/Nginx container.
