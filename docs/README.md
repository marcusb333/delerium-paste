# Delirium Documentation

Zero-knowledge encrypted paste system. All encryption happens client-side; the server never sees plaintext or keys.

## Quick Deploy

```bash
./deploy.sh local                              # Local (http://localhost:8080)
./deploy.sh vps-setup example.com admin@example.com  # VPS + SSL
./deploy.sh production                         # Production
./deploy.sh update                             # Update deployment
```

## Documentation Index

### Getting Started
- [Setup Guide](getting-started/SETUP.md) - Configure secrets and run locally

### Deployment
- [Deployment Guide](deployment/DEPLOYMENT.md) - Full deployment (local, VPS, SSL)
- [Kubernetes](deployment/KUBERNETES.md) - Deploy to a Kubernetes cluster
- [VPS Example](deployment/VPS_EXAMPLE.md) - Step-by-step VPS example
- [SSL Setup](deployment/SSL_SETUP.md) - SSL configuration
- [Multi-Architecture](deployment/multi-architecture.md) - AMD64/ARM64 builds
- [Auto-Deploy (CI/CD)](deployment/AUTO_DEPLOYMENT.md)

### Architecture
- [C4 Diagrams](architecture/C4-DIAGRAMS.md) - System, container, component diagrams
- [Proof of Work](architecture/PROOF_OF_WORK.md)

### Development
- [PR Guide](prs/README.md) - Contribution workflow
- [Testing Guide](../client/tests/README.md) - Unit, integration, E2E
- [Bazel Quickstart](development/BAZEL_QUICKSTART.md)
- [Docker Watch](development/DOCKER_WATCH.md) - Hot-reload development mode
- [Docker Watch](development/DOCKER_WATCH.md) - Hot-reload development mode

### Security
- [Security Checklist](security/CHECKLIST.md)
- [Headless Security](security/HEADLESS_SECURITY_CHECKLIST.md)

### Contributing
- [Cursor Migration](contributing/CURSOR_MIGRATION.md) - IDE setup
- [PR Review Guidelines](contributing/CURSOR-PR-REVIEW.md)
