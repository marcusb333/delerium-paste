# =============================================================================
# Delerium-Paste Makefile
# =============================================================================

NAMESPACE     := delerium
IMAGE         := marcusb333/delerium-server
PLATFORM      := linux/amd64
SSH_KEY       := ~/.ssh/rsync_net_key
SSH_OPTS      := -o IdentitiesOnly=yes -i $(SSH_KEY)
HCLOUD_CTX    := k8s-cluster
WORKERS       := 178.104.57.103 178.104.52.228 178.104.63.233
LB_NAME       := delerium-lb-nginx

# Repo root (two levels up from k8s/hetzner/)
REPO_ROOT     := $(shell git rev-parse --show-toplevel 2>/dev/null || echo ../..)

# Get version from latest git tag, fallback to 'latest'
VERSION       := $(shell git describe --tags --abbrev=0 2>/dev/null || echo "latest")
NEXT_VERSION  ?= $(VERSION)

# =============================================================================
# Docker
# =============================================================================

.PHONY: build push build-push

## Build the Docker image for amd64
build:
	docker buildx build --platform $(PLATFORM) -t $(IMAGE):$(NEXT_VERSION) -t $(IMAGE):latest $(REPO_ROOT)

## Push image to Docker Hub
push:
	docker push $(IMAGE):$(NEXT_VERSION)
	docker push $(IMAGE):latest

## Build and push in one step
build-push:
	docker buildx build --platform $(PLATFORM) \
		-t $(IMAGE):$(NEXT_VERSION) \
		-t $(IMAGE):latest \
		--push $(REPO_ROOT)

# =============================================================================
# Kubernetes - Deployment
# =============================================================================

.PHONY: deploy rollout rollout-status restart pods logs

## Deploy all k8s resources
deploy:
	kubectl apply -f 00-namespace.yaml
	kubectl apply -f 10-postgres.yaml
	kubectl apply -f 20-delerium-server.yaml
	kubectl apply -f 30-gateway.yaml

## Rolling update to a new image tag (usage: make rollout NEXT_VERSION=v1.8.0)
rollout:
	kubectl set image deployment/delerium-server \
		delerium-server=$(IMAGE):$(NEXT_VERSION) \
		-n $(NAMESPACE)
	@$(MAKE) rollout-status

## Check rollout status
rollout-status:
	kubectl rollout status deployment/delerium-server -n $(NAMESPACE) --timeout=180s

## Restart all delerium-server pods
restart:
	kubectl rollout restart deployment/delerium-server -n $(NAMESPACE)
	@$(MAKE) rollout-status

## Show all pods
pods:
	kubectl get pods -n $(NAMESPACE) -o wide

## Tail delerium-server logs
logs:
	kubectl logs -n $(NAMESPACE) -l app=delerium-server --tail=50 -f

# =============================================================================
# Kubernetes - Status
# =============================================================================

.PHONY: status gateway services nodes

## Full cluster status overview
status:
	@echo "=== Nodes ==="
	@kubectl get nodes -o wide
	@echo ""
	@echo "=== Pods ==="
	@kubectl get pods -n $(NAMESPACE) -o wide
	@echo ""
	@echo "=== Services ==="
	@kubectl get svc -n $(NAMESPACE)
	@echo ""
	@echo "=== Gateway ==="
	@kubectl get gateway -n $(NAMESPACE)
	@echo ""
	@echo "=== HTTPRoute ==="
	@kubectl get httproute -n $(NAMESPACE)

## Show gateway details
gateway:
	kubectl describe gateway delerium-gateway -n $(NAMESPACE)

## Show all services
services:
	kubectl get svc -n $(NAMESPACE)

## Show node info
nodes:
	kubectl get nodes -o wide

# =============================================================================
# Hetzner Load Balancer
# =============================================================================

.PHONY: lb-status lb-fix lb-targets

## Check LB health status
lb-status:
	@HCLOUD_CONTEXT=$(HCLOUD_CTX) hcloud load-balancer describe $(LB_NAME) | grep -A30 "Targets:"

## Fix LB targets (re-add all workers)
lb-fix:
	@echo "=== Adding LB targets ==="
	@HCLOUD_CONTEXT=$(HCLOUD_CTX) hcloud load-balancer add-target $(LB_NAME) --server k8s-worker-1 --use-private-ip 2>/dev/null || echo "worker-1: already a target"
	@HCLOUD_CONTEXT=$(HCLOUD_CTX) hcloud load-balancer add-target $(LB_NAME) --server k8s-worker-2 --use-private-ip 2>/dev/null || echo "worker-2: already a target"
	@HCLOUD_CONTEXT=$(HCLOUD_CTX) hcloud load-balancer add-target $(LB_NAME) --server k8s-worker-3 --use-private-ip 2>/dev/null || echo "worker-3: already a target"
	@echo "Waiting 20s for health checks..."
	@sleep 20
	@$(MAKE) lb-status

## Show LB target health
lb-targets:
	@$(MAKE) lb-status

# =============================================================================
# Node Maintenance
# =============================================================================

.PHONY: fix-flannel fix-rp-filter fix-kubelet-ips ssh-worker

## Fix Flannel to use private network interface
fix-flannel:
	kubectl get daemonset kube-flannel-ds -n kube-flannel -o yaml | \
		sed 's/- --kube-subnet-mgr/- --kube-subnet-mgr\n        - --iface=enp7s0/' | \
		kubectl apply -f -
	kubectl rollout status daemonset/kube-flannel-ds -n kube-flannel --timeout=120s

## Fix reverse path filtering on all workers
fix-rp-filter:
	@for ip in $(WORKERS); do \
		echo "=== Fixing rp_filter on $$ip ==="; \
		ssh $(SSH_OPTS) root@$$ip "\
			sysctl -w net.ipv4.conf.enp7s0.rp_filter=2; \
			sysctl -w net.ipv4.conf.all.rp_filter=2; \
			mkdir -p /etc/sysctl.d; \
			echo 'net.ipv4.conf.enp7s0.rp_filter=2' > /etc/sysctl.d/99-hetzner-lb.conf; \
			echo 'net.ipv4.conf.all.rp_filter=2' >> /etc/sysctl.d/99-hetzner-lb.conf"; \
	done

## Fix kubelet node IPs to use private network
fix-kubelet-ips:
	ssh $(SSH_OPTS) root@178.104.57.103 "echo 'KUBELET_EXTRA_ARGS=--node-ip=10.0.1.20' | tee /etc/default/kubelet && systemctl restart kubelet"
	ssh $(SSH_OPTS) root@178.104.52.228 "echo 'KUBELET_EXTRA_ARGS=--node-ip=10.0.1.21' | tee /etc/default/kubelet && systemctl restart kubelet"
	ssh $(SSH_OPTS) root@178.104.63.233 "echo 'KUBELET_EXTRA_ARGS=--node-ip=10.0.1.22' | tee /etc/default/kubelet && systemctl restart kubelet"

## SSH into a worker (usage: make ssh-worker N=1)
ssh-worker:
	@case "$(N)" in \
		1) ssh $(SSH_OPTS) root@178.104.57.103 ;; \
		2) ssh $(SSH_OPTS) root@178.104.52.228 ;; \
		3) ssh $(SSH_OPTS) root@178.104.63.233 ;; \
		*) echo "Usage: make ssh-worker N=1|2|3" ;; \
	esac

# =============================================================================
# Full recovery
# =============================================================================

.PHONY: fix-all health

## Run all fixes (kubelet IPs, flannel, rp_filter, LB targets)
fix-all: fix-kubelet-ips fix-rp-filter lb-fix
	@echo ""
	@echo "=== All fixes applied ==="
	@$(MAKE) status

## Quick health check
health:
	@echo "=== Pod Health ==="
	@kubectl get pods -n $(NAMESPACE)
	@echo ""
	@echo "=== LB Health ==="
	@HCLOUD_CONTEXT=$(HCLOUD_CTX) hcloud load-balancer describe $(LB_NAME) 2>/dev/null | grep -A15 "Targets:" || echo "Could not reach hcloud"
	@echo ""
	@echo "=== Endpoint Health ==="
	@curl -s -o /dev/null -w "https://iloverexs.com → HTTP %{http_code}\n" --max-time 5 https://iloverexs.com/api/health || echo "Endpoint unreachable"

# =============================================================================
# Help
# =============================================================================

.PHONY: help
help:
	@echo "Delerium-Paste Makefile"
	@echo ""
	@echo "Docker:"
	@echo "  make build                Build image for amd64"
	@echo "  make push                 Push to Docker Hub"
	@echo "  make build-push           Build and push in one step"
	@echo ""
	@echo "Deploy:"
	@echo "  make deploy               Apply all k8s manifests"
	@echo "  make rollout V=v1.8.0     Rolling update to new version"
	@echo "  make restart              Restart all delerium-server pods"
	@echo "  make pods                 Show all pods"
	@echo "  make logs                 Tail server logs"
	@echo ""
	@echo "Status:"
	@echo "  make status               Full cluster overview"
	@echo "  make health               Quick health check"
	@echo "  make lb-status            Load balancer health"
	@echo ""
	@echo "Fixes:"
	@echo "  make fix-all              Run all fixes"
	@echo "  make lb-fix               Re-add LB targets"
	@echo "  make fix-flannel          Fix Flannel interface"
	@echo "  make fix-rp-filter        Fix reverse path filtering"
	@echo "  make fix-kubelet-ips      Fix kubelet private IPs"
	@echo ""
	@echo "Utility:"
	@echo "  make ssh-worker N=1       SSH into worker node"

.DEFAULT_GOAL := help
