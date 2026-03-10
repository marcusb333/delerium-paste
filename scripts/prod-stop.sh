#!/bin/bash

# Production Stop Script
# Safely stops production containers

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

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}🛑 Stopping Delirium Production${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if containers are running
if ! $DOCKER_COMPOSE $COMPOSE_FILES ps | grep -q "Up"; then
    echo -e "${YELLOW}⚠️  No containers are currently running${NC}"
    exit 0
fi

echo -e "${YELLOW}🔄 Stopping containers...${NC}"
$DOCKER_COMPOSE $COMPOSE_FILES down

echo ""
echo -e "${GREEN}✅ Production containers stopped${NC}"
echo ""
echo -e "${BLUE}📝 Note:${NC} Data is preserved in Docker volumes"
echo -e "   To start again: ${YELLOW}./scripts/deploy-prod.sh${NC}"
echo -e "   To remove data: ${RED}sudo docker volume rm delirium_server-data${NC}"
echo ""
