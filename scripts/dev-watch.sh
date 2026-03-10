#!/bin/bash
set -e

# Development script for Delirium with Docker watch
# This script starts Docker watch for automatic file syncing and optionally runs TypeScript watch

echo "🔧 Starting Delirium development environment with Docker watch..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check Docker Compose version for watch support
DOCKER_COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || echo "0.0.0")
REQUIRED_VERSION="2.22.0"

version_compare() {
    printf '%s\n%s\n' "$2" "$1" | sort -V -C
}

if ! version_compare "$DOCKER_COMPOSE_VERSION" "$REQUIRED_VERSION"; then
    echo "⚠️  Warning: Docker Compose $REQUIRED_VERSION or higher is recommended for watch support."
    echo "   Current version: $DOCKER_COMPOSE_VERSION"
    echo "   Update Docker Desktop or docker-compose plugin for best experience."
    echo ""
fi

# Check if Node.js is available
if ! command -v node > /dev/null 2>&1; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ and try again."
    exit 1
fi

# Check npm
if ! command -v npm > /dev/null 2>&1; then
    echo "❌ npm is not installed. Please install Node.js 18+ (includes npm) and try again."
    exit 1
fi

# Check curl (needed for health checks)
if ! command -v curl > /dev/null 2>&1; then
    echo "❌ curl is not installed. Please install curl and try again."
    exit 1
fi

# Generate local TLS certs if needed
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$SCRIPT_DIR/generate-local-certs.sh"

# Install client dependencies if needed
if [ ! -d "client/node_modules" ]; then
    echo "📦 Installing client dependencies..."
    cd client
    npm install
    cd ..
fi

# Build client once before starting
echo "📦 Building TypeScript client..."
cd client
npm run build
cd ..

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping development environment..."
    if [ ! -z "$WATCH_PID" ]; then
        kill $WATCH_PID 2>/dev/null || true
    fi
    docker compose -f docker-compose.yml -f docker-compose.dev.yml down
    echo "✅ Development environment stopped"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

echo ""
echo "🚀 Starting Docker services with watch mode..."
echo "👀 Docker will automatically sync file changes"
echo "📝 TypeScript will automatically recompile on changes"
echo "🌐 Frontend available at https://localhost:8443"
echo "🔧 Backend API available at http://localhost:8080/api"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Start TypeScript watch in background
cd client
npm run watch > /tmp/typescript-watch.log 2>&1 &
WATCH_PID=$!
cd ..

echo "✅ TypeScript watch started (PID: $WATCH_PID)"
echo "📋 TypeScript logs: tail -f /tmp/typescript-watch.log"
echo ""

# Start Docker watch (this will block)
docker compose -f docker-compose.yml -f docker-compose.dev.yml watch
