#!/bin/bash

# Production Status Check Script
# Shows detailed status of production deployment

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml"

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Detect docker-compose command
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="sudo docker-compose"
elif sudo docker compose version &> /dev/null 2>&1; then
    DOCKER_COMPOSE="sudo docker compose"
else
    echo -e "${RED}❌ Error: Neither 'docker-compose' nor 'docker compose' found${NC}"
    exit 1
fi

cd "$PROJECT_DIR"

# Load domain from .env if available
DOMAIN=""
if [ -f ".env" ]; then
    set -a
    source .env
    set +a
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}📊 Delirium Production Status${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Container status
echo -e "${BLUE}🐳 Container Status:${NC}"
$DOCKER_COMPOSE $COMPOSE_FILES ps
echo ""

# Check if containers are running
if ! $DOCKER_COMPOSE $COMPOSE_FILES ps | grep -q "Up"; then
    echo -e "${RED}❌ No containers are running${NC}"
    echo ""
    echo "Start with: ./scripts/deploy-prod.sh"
    exit 1
fi

# API Health Check
echo -e "${BLUE}🧪 API Health Check:${NC}"
if curl -s http://localhost/api/health > /dev/null 2>&1; then
    RESPONSE=$(curl -s http://localhost/api/health)
    echo -e "${GREEN}✅ API is responding${NC}"
    echo -e "   Response: ${YELLOW}$RESPONSE${NC}"
else
    echo -e "${RED}❌ API is not responding${NC}"
fi
echo ""

# SSL Certificate Info
echo -e "${BLUE}🔒 SSL Certificate:${NC}"
if [ -f "ssl/fullchain.pem" ]; then
    CERT_DOMAIN=$(openssl x509 -in ssl/fullchain.pem -noout -subject 2>/dev/null | sed -n 's/.*CN = \(.*\)/\1/p')
    CERT_EXPIRY=$(openssl x509 -in ssl/fullchain.pem -noout -enddate 2>/dev/null | cut -d= -f2)
    echo -e "   Domain: ${GREEN}$CERT_DOMAIN${NC}"
    echo -e "   Expires: ${YELLOW}$CERT_EXPIRY${NC}"
else
    echo -e "${RED}   ❌ No SSL certificate found${NC}"
fi
echo ""

# Disk Usage
echo -e "${BLUE}💾 Data Volume:${NC}"
if sudo docker volume ls | grep -q "delirium_server-data"; then
    VOLUME_SIZE=$(sudo docker run --rm -v delirium_server-data:/data alpine du -sh /data 2>/dev/null | cut -f1)
    echo -e "   Size: ${YELLOW}$VOLUME_SIZE${NC}"
else
    echo -e "${RED}   ❌ No data volume found${NC}"
fi
echo ""

# Recent logs
echo -e "${BLUE}📝 Recent Logs (last 10 lines):${NC}"
$DOCKER_COMPOSE $COMPOSE_FILES logs --tail=10
echo ""

# Access URLs
echo -e "${BLUE}🌐 Access URLs:${NC}"
if [ -n "$DOMAIN" ] && [ "$DOMAIN" != "localhost" ]; then
    echo -e "   HTTPS: ${GREEN}https://$DOMAIN${NC}"
    echo -e "   HTTP:  ${GREEN}http://$DOMAIN${NC} (redirects to HTTPS)"
else
    echo -e "   HTTP:  ${GREEN}http://localhost${NC}"
fi
echo ""

# Uptime
echo -e "${BLUE}⏱️  Container Uptime:${NC}"
$DOCKER_COMPOSE $COMPOSE_FILES ps --format "table {{.Name}}\t{{.Status}}"
echo ""
