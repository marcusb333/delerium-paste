#!/bin/bash
set -e

# Production Deployment Script for Delirium
# Usage: ./scripts/deploy-prod.sh [options]
# Options:
#   --no-backup     Skip database backup
#   --quick         Skip backup (fastest)
#   --pull          Pull images from registry (default behavior)
#   --build         Build images locally instead of pulling
#   --no-build      Skip Docker image build (use existing images)
#   --skip-deps     Skip dependency installation
#   --skip-ssl      Skip SSL setup

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="docker-compose.prod.yml"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse command line arguments
NO_BACKUP=false
QUICK_MODE=false
PULL_IMAGES=true  # Default to pulling latest images
NO_DOCKER_BUILD=false
SKIP_DEPS=false
SKIP_SSL=false

for arg in "$@"; do
    case $arg in
        --no-backup)
            NO_BACKUP=true
            shift
            ;;
        --quick)
            QUICK_MODE=true
            NO_BACKUP=true
            shift
            ;;
        --build)
            PULL_IMAGES=false
            shift
            ;;
        --pull)
            PULL_IMAGES=true
            NO_DOCKER_BUILD=true
            shift
            ;;
        --no-build)
            NO_DOCKER_BUILD=true
            shift
            ;;
        --skip-deps)
            SKIP_DEPS=true
            shift
            ;;
        --skip-ssl)
            SKIP_SSL=true
            shift
            ;;
        --help)
            echo "Production Deployment Script for Delirium"
            echo ""
            echo "Usage: ./scripts/deploy-prod.sh [options]"
            echo ""
            echo "Options:"
            echo "  --no-backup     Skip database backup"
            echo "  --quick         Skip backup (fastest)"
            echo "  --pull          Pull images from registry (default behavior)"
            echo "  --build         Build images locally instead of pulling"
            echo "  --no-build      Skip Docker image build (use existing images)"
            echo "  --skip-deps     Skip dependency installation"
            echo "  --skip-ssl      Skip SSL setup"
            echo "  --help          Show this help message"
            echo ""
            echo "Examples:"
            echo "  ./scripts/deploy-prod.sh                    # Full deployment (pull latest)"
            echo "  ./scripts/deploy-prod.sh --quick            # Quick deploy (no backup)"
            echo "  ./scripts/deploy-prod.sh --build            # Build from source"
            echo "  ./scripts/deploy-prod.sh --skip-ssl         # Skip SSL setup"
            exit 0
            ;;
    esac
done

# Detect docker compose command (prefer v2 plugin over v1 standalone)
if sudo docker compose version &> /dev/null 2>&1; then
    DOCKER_COMPOSE="sudo docker compose"
elif command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}Warning: Using legacy docker-compose v1. Consider upgrading to Docker Compose V2.${NC}"
    DOCKER_COMPOSE="sudo docker-compose"
else
    echo -e "${RED}Error: Neither 'docker compose' nor 'docker-compose' found${NC}"
    exit 1
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Delirium Production Deployment${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Change to project directory
cd "$PROJECT_DIR"

# ── Architecture Detection ──────────────────────────────────────────

ARCH=$(uname -m)
case "$ARCH" in
    x86_64)       DOCKER_ARCH="amd64" ;;
    aarch64|arm64) DOCKER_ARCH="arm64" ;;
    armv7l)       DOCKER_ARCH="arm/v7" ;;
    *)            DOCKER_ARCH="$ARCH" ;;
esac

OS=$(uname -s)
echo -e "${BLUE}System: ${OS} ${ARCH} (Docker platform: linux/${DOCKER_ARCH})${NC}"
echo ""

# ── Dependency Installation ─────────────────────────────────────────

if [ "$SKIP_DEPS" = false ]; then
    echo -e "${YELLOW}Checking and installing dependencies...${NC}"

    # Detect package manager
    if command -v apt-get &> /dev/null; then
        PKG_MANAGER="apt"
        PKG_UPDATE="sudo apt-get update -qq"
        PKG_INSTALL="sudo apt-get install -y -qq"
    elif command -v dnf &> /dev/null; then
        PKG_MANAGER="dnf"
        PKG_UPDATE="true"
        PKG_INSTALL="sudo dnf install -y -q"
    elif command -v yum &> /dev/null; then
        PKG_MANAGER="yum"
        PKG_UPDATE="true"
        PKG_INSTALL="sudo yum install -y -q"
    elif command -v apk &> /dev/null; then
        PKG_MANAGER="apk"
        PKG_UPDATE="sudo apk update"
        PKG_INSTALL="sudo apk add --no-cache"
    elif command -v brew &> /dev/null; then
        PKG_MANAGER="brew"
        PKG_UPDATE="true"
        PKG_INSTALL="brew install"
    else
        echo -e "${YELLOW}  Unknown package manager, skipping dependency installation${NC}"
        PKG_MANAGER="none"
    fi

    UPDATED=false
    ensure_updated() {
        if [ "$UPDATED" = false ] && [ "$PKG_MANAGER" != "none" ]; then
            $PKG_UPDATE 2>/dev/null
            UPDATED=true
        fi
    }

    # curl (needed for health checks and Docker install)
    if ! command -v curl &> /dev/null; then
        echo -e "${YELLOW}  Installing curl...${NC}"
        ensure_updated
        $PKG_INSTALL curl
    fi

    # openssl (needed for secret generation)
    if ! command -v openssl &> /dev/null; then
        echo -e "${YELLOW}  Installing openssl...${NC}"
        ensure_updated
        $PKG_INSTALL openssl
    fi

    # Docker
    if ! command -v docker &> /dev/null; then
        echo -e "${YELLOW}  Installing Docker...${NC}"
        curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
        sudo sh /tmp/get-docker.sh
        rm /tmp/get-docker.sh
        sudo usermod -aG docker "$USER"
        echo -e "${GREEN}  Docker installed${NC}"
        echo -e "${YELLOW}  You may need to log out and back in for Docker group permissions${NC}"
    fi

    # Docker Compose plugin
    if ! command -v docker-compose &> /dev/null && ! sudo docker compose version &> /dev/null 2>&1; then
        echo -e "${YELLOW}  Installing Docker Compose...${NC}"
        ensure_updated
        if [ "$PKG_MANAGER" = "apt" ]; then
            $PKG_INSTALL docker-compose-plugin
        else
            # Fallback: install standalone docker-compose
            COMPOSE_VERSION="v2.32.4"
            COMPOSE_ARCH="$ARCH"
            [ "$COMPOSE_ARCH" = "arm64" ] && COMPOSE_ARCH="aarch64"
            sudo curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-${COMPOSE_ARCH}" \
                -o /usr/local/bin/docker-compose
            sudo chmod +x /usr/local/bin/docker-compose
        fi
    fi

    # certbot (for SSL — optional)
    if [ "$SKIP_SSL" = false ] && ! command -v certbot &> /dev/null; then
        echo -e "${YELLOW}  Installing certbot for SSL...${NC}"
        ensure_updated
        if [ "$PKG_MANAGER" = "apt" ]; then
            $PKG_INSTALL certbot
        elif [ "$PKG_MANAGER" = "dnf" ] || [ "$PKG_MANAGER" = "yum" ]; then
            $PKG_INSTALL certbot
        elif [ "$PKG_MANAGER" = "brew" ]; then
            $PKG_INSTALL certbot
        else
            echo -e "${YELLOW}  Could not install certbot automatically, skipping${NC}"
        fi
    fi

    echo -e "${GREEN}All dependencies installed/verified${NC}"
    echo ""
else
    echo -e "${YELLOW}Skipping dependency check${NC}"
    echo ""
fi

# ── SSL Setup ───────────────────────────────────────────────────────

if [ "$SKIP_SSL" = false ]; then
    echo -e "${YELLOW}Checking SSL certificates...${NC}"

    if [ ! -f "ssl/fullchain.pem" ] || [ ! -f "ssl/privkey.pem" ]; then
        echo -e "${YELLOW}  SSL certificates not found${NC}"

        # Check if domain is configured
        if [ -f ".env" ] && grep -q "DOMAIN=" .env; then
            source .env
            if [ -n "$DOMAIN" ] && [ "$DOMAIN" != "localhost" ]; then
                echo -e "${YELLOW}  Setting up SSL for domain: $DOMAIN${NC}"

                # Stop containers to free port 80
                $DOCKER_COMPOSE -f $COMPOSE_FILE down 2>/dev/null || true

                EMAIL="${SSL_EMAIL:-admin@$DOMAIN}"

                echo -e "${YELLOW}  Obtaining SSL certificate...${NC}"
                sudo certbot certonly --standalone \
                    -d "$DOMAIN" \
                    --non-interactive \
                    --agree-tos \
                    --email "$EMAIL" \
                    2>/dev/null || {
                        echo -e "${YELLOW}  Could not obtain SSL certificate automatically${NC}"
                        echo -e "${YELLOW}  Continuing without SSL...${NC}"
                    }

                if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
                    mkdir -p ssl
                    sudo cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ssl/ 2>/dev/null || true
                    sudo cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" ssl/ 2>/dev/null || true
                    sudo chown "$(id -un):$(id -gn)" ssl/*.pem 2>/dev/null || true
                    chmod 644 ssl/fullchain.pem 2>/dev/null || true
                    chmod 600 ssl/privkey.pem 2>/dev/null || true
                    echo -e "${GREEN}  SSL certificates obtained and configured${NC}"
                fi
            else
                echo -e "${YELLOW}  No domain configured, skipping SSL setup${NC}"
                echo -e "${YELLOW}  Set DOMAIN in .env to enable SSL${NC}"
            fi
        else
            echo -e "${YELLOW}  No .env file or DOMAIN not configured${NC}"
            echo -e "${YELLOW}  Continuing without SSL...${NC}"
        fi
    else
        echo -e "${GREEN}  SSL certificates found${NC}"
    fi
    echo ""
else
    echo -e "${YELLOW}Skipping SSL setup${NC}"
    echo ""
fi

# ── Secrets / .env Setup ───────────────────────────────────────────

if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file with secure secrets...${NC}"
    RANDOM_PEPPER=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p | tr -d '\n')
    RANDOM_PG_PASS=$(openssl rand -hex 16 2>/dev/null || head -c 16 /dev/urandom | xxd -p | tr -d '\n')
    cat > .env << ENVEOF
# Delirium Environment Configuration
# Generated on $(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Server-side pepper for hashing deletion tokens (do not change after first deploy)
DELETION_TOKEN_PEPPER=$RANDOM_PEPPER

# PostgreSQL password (do not change after first deploy without migrating data)
POSTGRES_PASSWORD=$RANDOM_PG_PASS

# Domain configuration (optional, for SSL)
# DOMAIN=your-domain.com
# SSL_EMAIL=admin@your-domain.com
ENVEOF
    chmod 600 .env
    echo -e "${GREEN}.env file created with secure random secrets${NC}"
    echo ""
else
    # Ensure POSTGRES_PASSWORD exists in .env (may have been created before PostgreSQL migration)
    if ! grep -q "POSTGRES_PASSWORD" .env; then
        echo -e "${YELLOW}Adding POSTGRES_PASSWORD to existing .env...${NC}"
        RANDOM_PG_PASS=$(openssl rand -hex 16 2>/dev/null || head -c 16 /dev/urandom | xxd -p | tr -d '\n')
        echo "" >> .env
        echo "# PostgreSQL password (do not change after first deploy without migrating data)" >> .env
        echo "POSTGRES_PASSWORD=$RANDOM_PG_PASS" >> .env
        echo -e "${GREEN}POSTGRES_PASSWORD added to .env${NC}"
    fi
fi

# Source environment variables
set -a
source .env
set +a

# Validate required secrets
MISSING=false
if [ -z "$DELETION_TOKEN_PEPPER" ] || [ "$DELETION_TOKEN_PEPPER" = "change-me" ]; then
    echo -e "${RED}Error: DELETION_TOKEN_PEPPER not set or using default value${NC}"
    MISSING=true
fi
if [ -z "$POSTGRES_PASSWORD" ] || [ "$POSTGRES_PASSWORD" = "delerium" ]; then
    echo -e "${RED}Error: POSTGRES_PASSWORD not set or using default value${NC}"
    MISSING=true
fi
if [ "$MISSING" = true ]; then
    echo "Please set secure values in .env file"
    exit 1
fi

echo -e "${GREEN}Secrets validated${NC}"
echo ""

# Create necessary directories
mkdir -p backups ssl

# ── Database Backup ─────────────────────────────────────────────────

if [ "$NO_BACKUP" = false ]; then
    echo -e "${YELLOW}Checking for existing database...${NC}"
    if $DOCKER_COMPOSE -f $COMPOSE_FILE ps 2>/dev/null | grep -qE "(Up|running)"; then
        echo -e "${YELLOW}Creating backup...${NC}"
        BACKUP_FILE="backups/delerium_pg_${TIMESTAMP}.sql.gz"

        # Dump PostgreSQL via the running container
        if $DOCKER_COMPOSE -f $COMPOSE_FILE exec -T postgres pg_dump -U delerium delerium 2>/dev/null | gzip > "$BACKUP_FILE"; then
            if [ -s "$BACKUP_FILE" ]; then
                echo -e "${GREEN}Backup created: $BACKUP_FILE${NC}"
            else
                rm -f "$BACKUP_FILE"
                echo -e "${YELLOW}No data to backup (database may be empty)${NC}"
            fi
        else
            rm -f "$BACKUP_FILE"
            echo -e "${YELLOW}Could not create backup (postgres may not be running)${NC}"
        fi
    else
        echo -e "${YELLOW}No running containers found, skipping backup${NC}"
    fi
    echo ""
fi

# ── Build or Pull Docker Images ────────────────────────────────────

if [ "$PULL_IMAGES" = true ]; then
    echo -e "${YELLOW}Pulling Docker images from registry...${NC}"
    $DOCKER_COMPOSE -f $COMPOSE_FILE pull
    echo -e "${GREEN}Docker images pulled${NC}"
    echo ""
elif [ "$NO_DOCKER_BUILD" = false ]; then
    echo -e "${YELLOW}Building Docker images (${DOCKER_ARCH})...${NC}"
    $DOCKER_COMPOSE -f $COMPOSE_FILE build --parallel 2>&1 | grep -v "DEPRECATED" || true
    echo -e "${GREEN}Docker images built${NC}"
    echo ""
else
    echo -e "${YELLOW}Skipping Docker image build (using existing images)${NC}"
    echo ""
fi

# ── Deploy ──────────────────────────────────────────────────────────

echo -e "${YELLOW}Stopping old containers...${NC}"
$DOCKER_COMPOSE -f $COMPOSE_FILE down
echo -e "${GREEN}Old containers stopped${NC}"
echo ""

echo -e "${YELLOW}Starting new containers...${NC}"
$DOCKER_COMPOSE -f $COMPOSE_FILE up -d
echo -e "${GREEN}Containers started${NC}"
echo ""

# ── Health Check ────────────────────────────────────────────────────

echo -e "${YELLOW}Waiting for services to be healthy...${NC}"
sleep 10

MAX_RETRIES=18
RETRY_COUNT=0
HEALTHY=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -sf http://localhost/health > /dev/null 2>&1; then
        HEALTHY=true
        break
    fi

    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo -e "${YELLOW}  Waiting... ($RETRY_COUNT/$MAX_RETRIES)${NC}"
    sleep 5
done

echo ""

if [ "$HEALTHY" = true ]; then
    echo -e "${GREEN}All services are healthy!${NC}"
else
    echo -e "${YELLOW}Services started but health check not yet passing${NC}"
    echo -e "${YELLOW}Check logs with: make prod-logs${NC}"
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Show service status
echo -e "${BLUE}Service Status:${NC}"
$DOCKER_COMPOSE -f $COMPOSE_FILE ps
echo ""

# Test API endpoint
echo -e "${BLUE}Testing API...${NC}"
if curl -sf http://localhost/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}API is responding${NC}"
elif curl -sf http://localhost:8080/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}API is responding (port 8080)${NC}"
else
    echo -e "${YELLOW}API not responding yet (may need more time to start)${NC}"
fi
echo ""

# Show access information
echo -e "${BLUE}Access:${NC}"
if [ -n "$DOMAIN" ] && [ "$DOMAIN" != "localhost" ] && [ -f "ssl/fullchain.pem" ]; then
    echo -e "   HTTPS: ${GREEN}https://$DOMAIN${NC}"
else
    echo -e "   HTTP:  ${GREEN}http://localhost${NC}"
    if [ -z "$DOMAIN" ] || [ "$DOMAIN" = "localhost" ]; then
        echo -e "   ${YELLOW}Tip: Set DOMAIN in .env to enable SSL${NC}"
    fi
fi
echo ""

echo -e "${BLUE}Commands:${NC}"
echo -e "   View logs:    ${YELLOW}make prod-logs${NC}"
echo -e "   Stop:         ${YELLOW}make prod-stop${NC}"
echo -e "   Status:       ${YELLOW}make prod-status${NC}"
echo -e "   Quick deploy: ${YELLOW}make deploy-prod -- --quick${NC}"
echo ""

echo -e "${GREEN}Delirium is running in production mode!${NC}"
