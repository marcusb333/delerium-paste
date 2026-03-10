#!/bin/bash

# Production Logs Viewer
# Usage: ./scripts/prod-logs.sh [service] [options]
# Examples:
#   ./scripts/prod-logs.sh              # All logs (follow mode)
#   ./scripts/prod-logs.sh server       # Server logs only
#   ./scripts/prod-logs.sh web          # Web logs only
#   ./scripts/prod-logs.sh --tail=50    # Last 50 lines

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml"

# Detect docker-compose command
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="sudo docker-compose"
elif sudo docker compose version &> /dev/null 2>&1; then
    DOCKER_COMPOSE="sudo docker compose"
else
    echo "❌ Error: Neither 'docker-compose' nor 'docker compose' found"
    exit 1
fi

cd "$PROJECT_DIR"

# Default to following all logs
SERVICE=""
TAIL_LINES=""
FOLLOW="-f"

# Parse arguments
for arg in "$@"; do
    case $arg in
        server|web)
            SERVICE=$arg
            ;;
        --tail=*)
            TAIL_LINES="--tail=${arg#*=}"
            FOLLOW=""
            ;;
        --no-follow)
            FOLLOW=""
            ;;
    esac
done

echo "📋 Viewing production logs..."
echo "   Press Ctrl+C to exit"
echo ""

if [ -n "$SERVICE" ]; then
    $DOCKER_COMPOSE $COMPOSE_FILES logs $FOLLOW $TAIL_LINES $SERVICE
else
    $DOCKER_COMPOSE $COMPOSE_FILES logs $FOLLOW $TAIL_LINES
fi
