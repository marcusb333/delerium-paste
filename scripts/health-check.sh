#!/bin/bash
set -e

# Health check script for Delirium
# This script verifies that all services are running and healthy

echo "🏥 Delirium Health Check"
echo "========================"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running"
    exit 1
fi
echo "✅ Docker is running"

# Check if containers are running
echo ""
echo "🐳 Checking container status..."
if ! docker compose ps | grep -q "Up"; then
    echo "❌ No containers are running"
    echo "   Run 'make start' to start the services"
    exit 1
fi

# Check individual services
echo "✅ Containers are running"

# Check server container
if docker compose ps | grep -q "delirium-server.*Up"; then
    echo "✅ Server container is running"
else
    echo "❌ Server container is not running"
    exit 1
fi

# Check web container
if docker compose ps | grep -q "delirium-web.*Up"; then
    echo "✅ Web container is running"
else
    echo "❌ Web container is not running"
    exit 1
fi

# Check API endpoint
echo ""
echo "🌐 Checking API endpoints..."
if curl -s -f http://localhost:8080/api/health > /dev/null 2>&1; then
    echo "✅ API is responding"
else
    echo "❌ API is not responding"
    echo "   Check logs with: make logs"
    exit 1
fi

# Check frontend
if curl -s -f http://localhost:8080/ > /dev/null 2>&1; then
    echo "✅ Frontend is accessible"
else
    echo "❌ Frontend is not accessible"
    echo "   Check logs with: make logs"
    exit 1
fi

# Check specific API endpoints
echo ""
echo "🔍 Testing specific endpoints..."

# Test PoW endpoint
POW_RESPONSE=$(curl -s http://localhost:8080/api/pow)
if [ -n "$POW_RESPONSE" ]; then
    echo "✅ PoW endpoint working"
else
    echo "⚠️  PoW endpoint returned empty response"
fi

# Test health endpoint (if available)
if curl -s -f http://localhost:8080/api/health > /dev/null 2>&1; then
    echo "✅ Health endpoint working"
else
    echo "⚠️  Health endpoint not available (this is optional)"
fi

# Check disk space
echo ""
echo "💾 Checking system resources..."
DISK_USAGE=$(df -h . | tail -1 | awk '{print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -lt 90 ]; then
    echo "✅ Disk usage: ${DISK_USAGE}%"
else
    echo "⚠️  Disk usage is high: ${DISK_USAGE}%"
fi

# Check memory usage (works on both Linux and macOS)
if command -v free > /dev/null 2>&1; then
    # Linux
    MEMORY_USAGE=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
    if [ "$MEMORY_USAGE" -lt 90 ]; then
        echo "✅ Memory usage: ${MEMORY_USAGE}%"
    else
        echo "⚠️  Memory usage is high: ${MEMORY_USAGE}%"
    fi
else
    # macOS
    MEMORY_USAGE=$(vm_stat | grep "Pages active" | awk '{print $3}' | sed 's/\.//')
    echo "✅ Memory check skipped (macOS detected)"
fi

echo ""
echo "🎉 All health checks passed!"
echo ""
echo "📊 Service Summary:"
docker compose ps
echo ""
echo "🌐 Access URLs:"
echo "   Frontend: https://localhost:8443"
echo "   API:      https://localhost:8443/api"
echo "   Health:   https://localhost:8443/api/health"
echo "   PoW:      https://localhost:8443/api/pow"

echo ""
echo "📋 Useful commands:"
echo "   make logs     - View service logs"
echo "   make stop     - Stop services"
echo "   make restart  - Restart services"
