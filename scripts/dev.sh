#!/bin/bash
set -e

# Development script for Delirium with hot-reload
# This script starts the backend in Docker and runs the frontend in watch mode

echo "🔧 Starting Delirium development environment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
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

# Start backend in Docker
echo "🐳 Starting backend and web services..."
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d server web

# Wait for backend to be ready
echo "⏳ Waiting for services to be ready..."
sleep 5

# Check if backend is responding
if ! curl -sk https://localhost:8443/api/health > /dev/null 2>&1; then
    echo "⚠️  Backend might not be ready yet, but continuing..."
fi

# Start frontend in watch mode
echo "👀 Starting TypeScript watch mode..."
echo "🌐 Frontend will be available at https://localhost:8443"
echo "📝 TypeScript will automatically recompile on file changes"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping development environment..."
    docker compose -f docker-compose.yml -f docker-compose.dev.yml down
    echo "✅ Development environment stopped"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Start TypeScript in watch mode
cd client
npm run watch &
WATCH_PID=$!

# Wait for the watch process
wait $WATCH_PID
