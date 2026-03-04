# Delirium - Zero-Knowledge Paste System
# Makefile for local development and deployment

.PHONY: help setup start stop restart logs dev dev-watch clean test build-client build-server build-server-image health-check quick-start deploy-full security-scan build-multiarch push-multiarch deploy-prod prod-status prod-logs prod-stop bazel-setup build-server-bazel test-server-bazel run-server-bazel ci-check ci-quick version-bump version-bump-dry-run release release-dry-run release-continue build-web-image push-web-image k8s-apply k8s-delete k8s-status k8s-setup k8s-install-cert-manager k8s-deploy k8s-tls-prod k8s-cert-status k8s-install-ingress k8s-local aws-create aws-k3s-setup aws-k3s-deploy aws-k3s-status

# Default target
help:
	@echo "Delirium - Zero-Knowledge Paste System"
	@echo ""
	@echo "Available commands:"
	@echo ""
	@echo "🚀 Production:"
	@echo "  make deploy-prod   - Deploy to production (with backup)"
	@echo "  make prod-status   - Check production status"
	@echo "  make prod-logs     - View production logs"
	@echo "  make prod-stop     - Stop production containers"
	@echo ""
	@echo "🔧 Development:"
	@echo "  make setup         - 🔐 Interactive setup wizard (configure secrets)"
	@echo "  make start         - Start everything (build client + docker compose up)"
	@echo "  make stop          - Stop all containers"
	@echo "  make restart       - Restart services"
	@echo "  make logs          - Follow logs from all services"
	@echo "  make dev           - Development mode with hot-reload (TypeScript watch + Docker)"
	@echo "  make dev-watch     - Development mode with Docker watch (auto-sync file changes)"
	@echo "  make clean         - Clean up everything (volumes, containers, etc.)"
	@echo "  make test          - Run all tests"
	@echo "  make build-client  - Build TypeScript only"
	@echo "  make build-server-image - Build server Docker image locally (then make start to use it)"
	@echo "  make health-check  - Verify services are running"
	@echo "  make quick-start   - First-time setup and start"
	@echo "  make quick-start-headless - First-time setup for headless environments"
	@echo ""
	@echo "🧪 CI Verification:"
	@echo "  make ci-check      - Run full CI checks locally (parallel)"
	@echo "  make ci-quick       - Run quick CI checks (lint, type, tests)"
	@echo ""
	@echo "📦 Version Management:"
	@echo "  make version-bump VERSION=1.0.7 - Bump version across codebase"
	@echo "  make version-bump-dry-run VERSION=1.0.7 - Preview version changes"
	@echo ""
	@echo "🚢 Release:"
	@echo "  make release ARGS='--patch'    - Run full release pipeline (--patch|--minor|--major)"
	@echo "  make release-dry-run           - Preview release pipeline"
	@echo "  make release-continue          - Resume interrupted release"
	@echo ""
	@echo "🔧 Bazel (Server Build):"
	@echo "  make bazel-setup   - Install Bazelisk (one-time setup)"
	@echo "  make build-server-bazel - Build server with Bazel"
	@echo "  make test-server-bazel  - Run server tests with Bazel"
	@echo "  make run-server-bazel   - Run server locally with Bazel"
	@echo ""
	@echo "🔒 Security:"
	@echo "  make security-setup - Enhance security for headless environments"
	@echo "  make start-secure  - Start with security enhancements"
	@echo "  make security-check - Run security verification"
	@echo "  make security-scan - Run automated vulnerability scanning"
	@echo ""
	@echo "📊 Monitoring:"
	@echo "  make monitor       - Start service monitoring"
	@echo "  make backup        - Create data backup"
	@echo ""
	@echo "🐳 Docker:"
	@echo "  make build-server-image - Build server Docker image locally (used by make start if not pulled)"
	@echo "  make build-web-image    - Build web (nginx+client) Docker image locally"
	@echo "  make push-web-image VERSION=v1.0.9 - Build and push web image to Docker Hub"
	@echo "  make deploy-full   - Full pipeline: clean, build, test, and deploy"
	@echo "  make build-multiarch - Build multi-architecture Docker images locally"
	@echo "  make push-multiarch - Build and push multi-architecture images to registry"
	@echo ""
	@echo "☸️  Kubernetes:"
	@echo "  make k8s-setup     - Interactive first-time setup (domain, email, pepper)"
	@echo "  make k8s-apply     - Apply all Kubernetes manifests (kubectl apply -k k8s/)"
	@echo "  make k8s-deploy    - Full deploy: apply manifests + show status"
	@echo "  make k8s-delete    - Delete all Kubernetes resources"
	@echo "  make k8s-status    - Show pod/service/ingress status in the delerium namespace"
	@echo "  make k8s-install-cert-manager - Install cert-manager + apply ClusterIssuers"
	@echo "  make k8s-install-ingress     - Install ingress-nginx controller (Docker Desktop)"
	@echo "  make k8s-local     - Local dev: install ingress + apply manifests + print instructions"
	@echo "  make k8s-tls-prod  - Switch ingress from staging to production certificates"
	@echo "  make k8s-cert-status - Check certificate/order status"
	@echo ""
	@echo "☁️  AWS (k3s on EC2):"
	@echo "  make aws-create      - Launch an EC2 instance for Delerium"
	@echo "  make aws-k3s-setup   - Run k3s setup on an EC2 instance (run via SSH)"
	@echo "  make aws-k3s-deploy  - Apply AWS k3s overlay manifests"
	@echo "  make aws-k3s-status  - Show deployment status"
	@echo ""

# Interactive setup wizard
setup:
	@echo "🔐 Starting interactive setup wizard..."
	@chmod +x scripts/setup.sh
	./scripts/setup.sh

# Start everything
start: build-client
	@echo "🚀 Starting Delirium stack..."
	docker compose up -d
	@echo "✅ Services started! Access at http://localhost:8080"
	@echo "📊 Check status: make logs"

# Stop all containers
stop:
	@echo "🛑 Stopping Delirium stack..."
	docker compose down
	@echo "✅ Services stopped"

# Restart services
restart: stop start

# Follow logs
logs:
	@echo "📋 Following logs (Ctrl+C to exit)..."
	docker compose logs -f

# Development mode with hot-reload
dev:
	@echo "🔧 Starting development mode..."
	@echo "📝 Backend will run in Docker, frontend will watch for changes"
	@echo "🌐 Access at http://localhost:8080"
	@echo ""
	@chmod +x scripts/dev.sh
	./scripts/dev.sh

# Development mode with Docker watch (auto-sync file changes)
dev-watch:
	@echo "🔧 Starting development mode with Docker watch..."
	@chmod +x scripts/dev-watch.sh
	./scripts/dev-watch.sh

# Clean up everything
clean:
	@echo "🧹 Cleaning up Delirium stack..."
	docker compose down -v
	docker system prune -f
	@echo "✅ Cleanup complete"

# Run all tests
test:
	@echo "🧪 Running test suite..."
	cd client && npm test
	@echo "✅ Tests completed"

# Build TypeScript client
build-client:
	@echo "📦 Building TypeScript client..."
	cd client && npm run build
	@echo "✅ Client built"

# Build server Docker image locally (used by make start; otherwise image is pulled from registry)
build-server-image:
	@echo "🐳 Building server Docker image locally..."
	docker compose build server
	@echo "✅ Server image built (marcusb333/delerium-server:latest)"

# Build clean server image and push to Docker Hub with version tag; use: make push-server-version VERSION=v1.0.9
push-server-version:
	@if [ -z "$(VERSION)" ]; then \
		echo "❌ VERSION required. Usage: make push-server-version VERSION=v1.0.9"; \
		exit 1; \
	fi
	@echo "🐳 Building server image (no cache)..."
	docker compose build --no-cache server
	@echo "🏷️  Tagging $(VERSION)..."
	docker tag marcusb333/delerium-server:latest marcusb333/delerium-server:$(VERSION)
	@echo "📤 Pushing to Docker Hub..."
	docker push marcusb333/delerium-server:$(VERSION)
	@echo "✅ Pushed marcusb333/delerium-server:$(VERSION)"

# Health check
health-check:
	@echo "🏥 Checking service health..."
	@chmod +x scripts/health-check.sh
	./scripts/health-check.sh

# Quick start for first-time users
quick-start:
	@echo "🚀 Quick start setup..."
	@chmod +x scripts/quick-start.sh
	./scripts/quick-start.sh

# Quick start for headless environments
quick-start-headless:
	@echo "🚀 Quick start setup (headless mode)..."
	@chmod +x scripts/quick-start.sh
	HEADLESS=1 ./scripts/quick-start.sh

# Security setup for headless environments
security-setup:
	@echo "🔒 Setting up security enhancements..."
	@chmod +x scripts/security-setup.sh
	./scripts/security-setup.sh

# Start with security enhancements
start-secure: security-setup
	@echo "🛡️  Starting with security enhancements..."
	docker compose -f docker-compose.prod.yml -f docker-compose.secure.yml up -d

# Security check
security-check:
	@echo "🔍 Running security check..."
	@chmod +x scripts/security-check.sh
	./scripts/security-check.sh

# Security scan
security-scan:
	@echo "🔒 Running automated security scan..."
	@chmod +x scripts/security-scan.sh
	./scripts/security-scan.sh

# Monitor services
monitor:
	@echo "📊 Starting monitoring..."
	@chmod +x scripts/monitor.sh
	./scripts/monitor.sh

# Create backup
backup:
	@echo "💾 Creating backup..."
	@chmod +x scripts/backup.sh
	./scripts/backup.sh

# Full pipeline: clean, build, test, and deploy
# Optimized with parallel builds and tests for faster execution
deploy-full:
	@echo "=========================================="
	@echo "🚀 Full Pipeline: Clean, Build, Test & Deploy"
	@echo "=========================================="
	@echo ""
	@echo "🧹 Step 1/5: Cleaning..."
	@$(MAKE) clean
	@echo ""
	@echo "📦 Step 2/5: Building client and server in parallel..."
	@(cd client && npm run build) & \
	(cd server && bazel build //server:delerium_server_deploy) & \
	wait || exit 1
	@echo ""
	@echo "🧪 Step 3/5: Running tests in parallel..."
	@echo "  → Client tests..."
	@(cd client && npm test || (echo "⚠️  Client tests failed!" && exit 1)) & \
	CLIENT_PID=$$!; \
	echo "  → Server tests..."
	@(cd server && bazel test //server:all_tests --test_output=errors || (echo "⚠️  Server tests failed!" && exit 1)) & \
	SERVER_PID=$$!; \
	wait $$CLIENT_PID; \
	CLIENT_EXIT=$$?; \
	wait $$SERVER_PID; \
	SERVER_EXIT=$$?; \
	if [ $$CLIENT_EXIT -ne 0 ] || [ $$SERVER_EXIT -ne 0 ]; then \
		echo "❌ Tests failed!"; \
		exit 1; \
	fi
	@echo ""
	@echo "🐳 Step 4/5: Deploying to Docker..."
	@docker compose down
	@docker compose up -d
	@echo ""
	@echo "=========================================="
	@echo "✅ Full pipeline completed successfully!"
	@echo "=========================================="
	@echo "🌐 Access at http://localhost:8080"
	@echo "📊 Check logs: make logs"

# Build multi-architecture Docker images locally
build-multiarch:
	@echo "🏗️  Building multi-architecture Docker images..."
	@echo "📋 Checking Docker Buildx..."
	@docker buildx version || (echo "❌ Docker Buildx not found. Please install Docker Desktop or enable buildx." && exit 1)
	@echo "🔧 Creating/using buildx builder..."
	@docker buildx create --name delirium-builder --use 2>/dev/null || docker buildx use delirium-builder || docker buildx use default
	@echo "🏗️  Building for linux/amd64 and linux/arm64..."
	@docker buildx build \
		--platform linux/amd64,linux/arm64 \
		-f server/Dockerfile \
		--tag delerium-server:latest \
		--tag delerium-server:multi-arch \
		--load \
		.
	@echo "✅ Multi-architecture build complete!"
	@echo "📦 Images tagged as:"
	@echo "   - delerium-server:latest"
	@echo "   - delerium-server:multi-arch"

# Build and push multi-architecture images to registry
# Usage: make push-multiarch REGISTRY=ghcr.io/username TAG=v1.0.0
push-multiarch:
	@echo "🚀 Building and pushing multi-architecture Docker images..."
	@if [ -z "$(REGISTRY)" ]; then \
		echo "❌ REGISTRY variable not set. Usage: make push-multiarch REGISTRY=ghcr.io/username TAG=v1.0.0"; \
		exit 1; \
	fi
	@TAG=$${TAG:-latest}; \
	echo "📋 Registry: $(REGISTRY)"; \
	echo "🏷️  Tag: $$TAG"; \
	echo "🔧 Creating/using buildx builder..."; \
	docker buildx create --name delirium-builder --use 2>/dev/null || docker buildx use delirium-builder || docker buildx use default; \
	echo "🏗️  Building and pushing for linux/amd64 and linux/arm64..."; \
	docker buildx build \
		--platform linux/amd64,linux/arm64 \
		-f server/Dockerfile \
		--tag $(REGISTRY)/delerium-server:$$TAG \
		--tag $(REGISTRY)/delerium-server:latest \
		--push \
		.; \
	echo "✅ Multi-architecture images pushed successfully!"; \
	echo "📦 Images available at:"; \
	echo "   - $(REGISTRY)/delerium-server:$$TAG"; \
	echo "   - $(REGISTRY)/delerium-server:latest"; \
	echo "🔍 Inspect with: docker buildx imagetools inspect $(REGISTRY)/delerium-server:$$TAG"

# Production deployment commands
deploy-prod:
	@echo "🚀 Deploying to production..."
	@chmod +x scripts/deploy-prod.sh
	./scripts/deploy-prod.sh

prod-status:
	@echo "📊 Checking production status..."
	@chmod +x scripts/prod-status.sh
	./scripts/prod-status.sh

prod-logs:
	@echo "📋 Viewing production logs..."
	@chmod +x scripts/prod-logs.sh
	./scripts/prod-logs.sh

prod-stop:
	@echo "🛑 Stopping production..."
	@chmod +x scripts/prod-stop.sh
	./scripts/prod-stop.sh

# Bazel-specific targets
bazel-setup:
	@echo "🔧 Setting up Bazel..."
	@chmod +x scripts/setup-bazel.sh
	./scripts/setup-bazel.sh

build-server-bazel:
	@echo "📦 Building server with Bazel..."
	bazel build //server:delerium_server_deploy
	@echo "✅ Server built"

test-server-bazel:
	@echo "🧪 Running server tests with Bazel..."
	bazel test //server:all_tests --test_output=errors
	@echo "✅ Tests completed"

run-server-bazel:
	@echo "🚀 Running server with Bazel..."
	bazel run //server:delerium_server

# CI verification targets
ci-check:
	@echo "🧪 Running CI checks locally..."
	@chmod +x scripts/ci-verify-all.sh
	./scripts/ci-verify-all.sh

ci-quick:
	@echo "⚡ Running quick CI checks..."
	@chmod +x scripts/ci-verify-quick.sh
	./scripts/ci-verify-quick.sh

# Version management
version-bump:
	@if [ -z "$(VERSION)" ]; then \
		echo "❌ VERSION variable not set. Usage: make version-bump VERSION=1.0.7"; \
		exit 1; \
	fi
	@echo "🔄 Bumping version to $(VERSION)..."
	@chmod +x scripts/bump-version.sh
	./scripts/bump-version.sh $(VERSION)

version-bump-dry-run:
	@if [ -z "$(VERSION)" ]; then \
		echo "❌ VERSION variable not set. Usage: make version-bump-dry-run VERSION=1.0.7"; \
		exit 1; \
	fi
	@echo "🔍 Dry run: Previewing version bump to $(VERSION)..."
	@chmod +x scripts/bump-version.sh
	./scripts/bump-version.sh $(VERSION) --dry-run

# Release pipeline
release:
	@echo "🚢 Starting release pipeline..."
	@chmod +x scripts/release.sh
	./scripts/release.sh $(ARGS)

release-dry-run:
	@echo "🔍 Dry run: Previewing release pipeline..."
	@chmod +x scripts/release.sh
	./scripts/release.sh --dry-run

release-continue:
	@echo "🚢 Resuming release pipeline..."
	@chmod +x scripts/release.sh
	./scripts/release.sh --continue

# Build web Docker image locally (nginx + compiled TypeScript client)
build-web-image:
	@echo "🐳 Building web image locally..."
	docker compose build web
	@echo "✅ Web image built (marcusb333/delerium-web:latest)"

# Build and push web image to Docker Hub with version tag
# Usage: make push-web-image VERSION=v1.0.9
push-web-image:
	@if [ -z "$(VERSION)" ]; then \
		echo "❌ VERSION required. Usage: make push-web-image VERSION=v1.0.9"; \
		exit 1; \
	fi
	@echo "🐳 Building web image (no cache)..."
	docker compose build --no-cache web
	@echo "🏷️  Tagging $(VERSION)..."
	docker tag marcusb333/delerium-web:latest marcusb333/delerium-web:$(VERSION)
	@echo "📤 Pushing to Docker Hub..."
	docker push marcusb333/delerium-web:$(VERSION)
	docker push marcusb333/delerium-web:latest
	@echo "✅ Pushed marcusb333/delerium-web:$(VERSION)"

# Apply all Kubernetes manifests via kustomize
k8s-apply:
	@echo "☸️  Applying Kubernetes manifests..."
	@echo "⚠️  Ensure k8s/server/secret.yaml has a real DELETION_TOKEN_PEPPER before running."
	kubectl apply -k k8s/
	@echo "✅ Manifests applied. Monitor with: make k8s-status"

# Delete all Kubernetes resources in the delerium namespace
k8s-delete:
	@echo "☸️  Deleting Kubernetes resources..."
	kubectl delete -k k8s/ --ignore-not-found
	@echo "✅ Resources deleted"

# Interactive first-time Kubernetes setup
k8s-setup:
	@echo "☸️  Kubernetes first-time setup"
	@echo ""
	@read -p "Enter your domain (e.g. paste.mydomain.com): " DOMAIN; \
	read -p "Enter your email (for Let's Encrypt): " EMAIL; \
	PEPPER=$$(openssl rand -hex 32); \
	echo ""; \
	echo "Configuring domain: $$DOMAIN"; \
	sed -i'' -e "s/paste\.example\.com/$$DOMAIN/g" k8s/ingress.yaml; \
	echo "Configuring email: $$EMAIL"; \
	sed -i'' -e "s/REPLACE_WITH_YOUR_EMAIL/$$EMAIL/g" k8s/cert-manager/cluster-issuer.yaml; \
	echo "Generating deletion token pepper..."; \
	sed -i'' -e "s/REPLACE_WITH_OUTPUT_OF__openssl_rand_-hex_32/$$PEPPER/g" k8s/server/secret.yaml; \
	echo ""; \
	echo "--- Setup complete ---"; \
	echo "  Domain : $$DOMAIN  (k8s/ingress.yaml)"; \
	echo "  Email  : $$EMAIL  (k8s/cert-manager/cluster-issuer.yaml)"; \
	echo "  Pepper : (generated, 64-char hex in k8s/server/secret.yaml)"; \
	echo ""; \
	echo "Next steps:"; \
	echo "  1. make k8s-install-cert-manager   # if using TLS"; \
	echo "  2. make k8s-deploy                 # apply manifests"

# Install cert-manager and apply ClusterIssuers
k8s-install-cert-manager:
	@echo "☸️  Installing cert-manager..."
	kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml
	@echo "Waiting for cert-manager pods to be ready..."
	kubectl wait --namespace cert-manager --for=condition=Ready pod --all --timeout=120s
	@echo "Applying ClusterIssuers..."
	kubectl apply -f k8s/cert-manager/cluster-issuer.yaml
	@echo "✅ cert-manager installed and ClusterIssuers applied"

# Full Kubernetes deployment (apply + status)
k8s-deploy: k8s-apply k8s-status

# Show Kubernetes deployment status
k8s-status:
	@echo "☸️  Delerium namespace status:"
	@echo ""
	@echo "--- Pods ---"
	kubectl get pods -n delerium
	@echo ""
	@echo "--- Services ---"
	kubectl get svc -n delerium
	@echo ""
	@echo "--- Ingress ---"
	kubectl get ingress -n delerium
	@echo ""
	@echo "--- PVC ---"
	kubectl get pvc -n delerium

# Switch ingress from staging to production TLS certificates
k8s-tls-prod:
	@echo "☸️  Switching to production TLS certificates..."
	sed -i'' -e 's/letsencrypt-staging/letsencrypt-prod/' k8s/ingress.yaml
	kubectl apply -f k8s/ingress.yaml
	@echo "Deleting old staging secret to trigger renewal..."
	kubectl delete secret delerium-tls -n delerium --ignore-not-found
	@echo "✅ Switched to letsencrypt-prod. Monitor with: make k8s-cert-status"

# Check certificate status
k8s-cert-status:
	@echo "☸️  Certificate status:"
	@echo ""
	@echo "--- Certificates ---"
	kubectl get certificate -n delerium
	@echo ""
	@echo "--- CertificateRequests ---"
	kubectl get certificaterequest -n delerium
	@echo ""
	@echo "--- Orders ---"
	kubectl get order -n delerium

# Install ingress-nginx controller (Docker Desktop)
k8s-install-ingress:
	@echo "☸️  Installing ingress-nginx controller..."
	kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.12.1/deploy/static/provider/cloud/deploy.yaml
	@echo "Waiting for ingress-nginx controller to be ready..."
	kubectl wait --namespace ingress-nginx --for=condition=Ready pod -l app.kubernetes.io/component=controller --timeout=120s
	@echo "✅ ingress-nginx installed"

# Local dev: install ingress-nginx + apply manifests + print instructions
k8s-local: k8s-install-ingress k8s-apply
	@echo ""
	@echo "============================================"
	@echo "✅ Local Kubernetes stack is ready!"
	@echo "============================================"
	@echo ""
	@echo "NodePort access (works now):"
	@echo "  http://localhost:30080"
	@echo ""
	@echo "Ingress access (requires /etc/hosts entry):"
	@echo "  1. Add this line to /etc/hosts:"
	@echo "     127.0.0.1 test.delerium.cc"
	@echo "  2. Then visit: http://test.delerium.cc"
	@echo ""

# ──────────────────────────────────────────────
# AWS — k3s on EC2
# ──────────────────────────────────────────────

# Launch an EC2 instance configured for Delerium
aws-create:
	@echo "☁️  Launching AWS EC2 instance..."
	@chmod +x scripts/aws-ec2-create.sh
	./scripts/aws-ec2-create.sh

# Run k3s setup on the EC2 instance (run this after SSH'ing in)
aws-k3s-setup:
	@echo "☁️  Running k3s setup..."
	@chmod +x scripts/aws-k3s-setup.sh
	sudo ./scripts/aws-k3s-setup.sh

# Apply the AWS k3s overlay manifests
aws-k3s-deploy:
	@echo "☁️  Applying AWS k3s overlay manifests..."
	kubectl apply -k deploy/aws-k3s/
	@echo "✅ Manifests applied. Monitor with: make aws-k3s-status"

# Show AWS k3s deployment status
aws-k3s-status:
	@echo "☁️  Delerium on k3s — status:"
	@echo ""
	@echo "--- Nodes ---"
	kubectl get nodes
	@echo ""
	@echo "--- Pods ---"
	kubectl get pods -n delerium
	@echo ""
	@echo "--- Services ---"
	kubectl get svc -n delerium
	@echo ""
	@echo "--- Ingress ---"
	kubectl get ingress -n delerium
	@echo ""
	@echo "--- Certificates ---"
	-kubectl get certificate -n delerium 2>/dev/null
	@echo ""
