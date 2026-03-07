# Delirium Scripts

Collection of utility scripts for deploying and managing Delirium.

## 🚀 Production Scripts

### push-to-vps.sh

Copy `fresh-vps-install.sh` to a remote VPS and run it. Works with any user credentials.

```bash
# Basic usage
./scripts/push-to-vps.sh user@your-server.com

# With a specific SSH key
./scripts/push-to-vps.sh user@your-server.com ~/.ssh/id_ed25519

# Also wipe the paste database (fresh start)
WIPE_DATA=1 ./scripts/push-to-vps.sh user@your-server.com ~/.ssh/id_ed25519

# Via Make
make fresh-vps-install VPS=user@your-server.com
make fresh-vps-install VPS=user@your-server.com SSH_KEY=~/.ssh/id_ed25519
make fresh-vps-install VPS=user@your-server.com WIPE_DATA=1
```

Prints usage instructions if called without arguments.

### fresh-vps-install.sh

Self-contained installer that runs directly on the VPS — no git required on the server. Installs Docker, pulls the latest images, and starts Delirium. Called automatically by `push-to-vps.sh`.

### deploy-prod.sh

Deploy an update to an already-running production server (backup + pull + restart).

```bash
# Full deployment (recommended)
./scripts/deploy-prod.sh

# Quick deployment (skip build & backup)
./scripts/deploy-prod.sh --quick

# Skip client build only
./scripts/deploy-prod.sh --skip-build

# Skip backup only
./scripts/deploy-prod.sh --no-backup

# Show help
./scripts/deploy-prod.sh --help
```

**Features:**

- ✅ Environment validation
- 💾 Automatic database backup
- 📦 Client build
- 🐳 Docker image build
- 🔄 Zero-downtime deployment
- 🧪 Health checks
- 📊 Status reporting

### prod-status.sh

Check production deployment status.

```bash
./scripts/prod-status.sh
```

**Shows:**

- Container status
- API health
- SSL certificate info
- Data volume size
- Recent logs
- Access URLs

### prod-logs.sh

View production logs.

```bash
# All logs (follow mode)
./scripts/prod-logs.sh

# Server logs only
./scripts/prod-logs.sh server

# Web logs only
./scripts/prod-logs.sh web

# Last 50 lines
./scripts/prod-logs.sh --tail=50

# No follow mode
./scripts/prod-logs.sh --no-follow
```

### prod-stop.sh

Safely stop production containers.

```bash
./scripts/prod-stop.sh
```

Data is preserved in Docker volumes.

## 🔧 Development Scripts

### dev.sh

Start development environment with hot-reload.

```bash
./scripts/dev.sh
```

### quick-start.sh

First-time setup for local development.

```bash
./scripts/quick-start.sh
```

## 🔒 Security Scripts

### security-setup.sh

Configure security enhancements.

```bash
./scripts/security-setup.sh
```

### security-check.sh

Run security verification.

```bash
./scripts/security-check.sh
```

### security-scan.sh

Automated vulnerability scanning.

```bash
./scripts/security-scan.sh
```

### setup-ssl.sh

SSL certificate setup wizard.

```bash
./scripts/setup-ssl.sh
```

## 🧪 CI/CD Scripts

### ci-verify-all.sh

Run all CI checks locally.

```bash
./scripts/ci-verify-all.sh
```

### ci-verify-frontend.sh

Frontend checks only.

```bash
./scripts/ci-verify-frontend.sh
```

### ci-verify-backend.sh

Backend checks only.

```bash
./scripts/ci-verify-backend.sh
```

### ci-verify-quick.sh

Quick checks (no E2E tests).

```bash
./scripts/ci-verify-quick.sh
```

## 📦 Version Management Scripts

### bump-version.sh

Automatically bump version numbers across the entire codebase.

```bash
# Bump to a specific version
./scripts/bump-version.sh 1.0.7

# Preview changes without modifying files
./scripts/bump-version.sh 1.0.7 --dry-run

# Or use Make
make version-bump VERSION=1.0.7
make version-bump-dry-run VERSION=1.0.7
```

**Updates:**
- `client/package.json`
- `MODULE.bazel`
- HTML files (index.html, view.html, delete.html)
- Test files
- API documentation

See [Version Bumping Guide](../docs/versioning/VERSION_BUMPING.md) for detailed documentation.

## 📦 Deployment

```bash
# Fresh install on a new VPS
./scripts/push-to-vps.sh user@your-server.com [~/.ssh/key]

# Update an existing production deployment
./scripts/deploy-prod.sh
```

See [docs/deployment/DEPLOYMENT.md](../docs/deployment/DEPLOYMENT.md) for details.

## 🔍 Monitoring Scripts

### health-check.sh

Comprehensive health check.

```bash
./scripts/health-check.sh
```

### monitor.sh

Start service monitoring.

```bash
./scripts/monitor.sh
```

## 💾 Backup Scripts

### backup.sh

Create manual backup.

```bash
./scripts/backup.sh
```

## 📚 Quick Reference

| Task | Script |
|------|--------|
| Fresh install on new VPS | `push-to-vps.sh user@host [key]` |
| Deploy update to production | `deploy-prod.sh` |
| Check status | `prod-status.sh` |
| View logs | `prod-logs.sh` |
| Stop production | `prod-stop.sh` |
| Development mode | `dev.sh` |
| Security scan | `security-scan.sh` |
| Health check | `health-check.sh` |
| Backup | `backup.sh` |
| CI verification | `ci-verify-all.sh` |
| Bump version | `bump-version.sh` |

## 🎯 Common Workflows

### Initial Production Deployment (new server)

```bash
# Install everything on a fresh VPS
./scripts/push-to-vps.sh user@your-server.com ~/.ssh/id_ed25519
```

### Updating an Existing Deployment

```bash
# 1. Setup local environment (first time only)
./scripts/setup.sh

# 2. Configure SSL (if needed)
./scripts/setup-ssl.sh

# 3. Deploy
./scripts/deploy-prod.sh
```

### Update Production

```bash
# 1. Pull changes
git pull

# 2. Deploy with backup
./scripts/deploy-prod.sh

# 3. Verify
./scripts/prod-status.sh
```

### Quick Config Change

```bash
# Edit .env or configs
vim .env

# Quick deploy (no build/backup)
./scripts/deploy-prod.sh --quick

# Check status
./scripts/prod-status.sh
```

### Troubleshooting

```bash
# Check status
./scripts/prod-status.sh

# View logs
./scripts/prod-logs.sh

# Health check
./scripts/health-check.sh

# Restart
./scripts/prod-stop.sh
./scripts/deploy-prod.sh --skip-build
```

## 📖 Documentation

For detailed documentation, see:

- [Production Deployment Guide](../docs/deployment/DEPLOYMENT.md)
- [Main README](../docs/README.md)
- [Deployment Docs](../docs/deployment/)
