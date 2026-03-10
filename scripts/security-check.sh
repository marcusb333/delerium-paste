#!/bin/bash
set -e

# Security check script for Delirium
# Verifies that all security measures are properly configured

echo "🔍 Delirium Security Check"
echo "=========================="
echo ""

# Check if security setup has been run
if [ ! -f "docker-compose.secure.yml" ]; then
    echo "⚠️  Security enhancements not configured"
    echo "   Run 'make security-setup' first"
    exit 1
fi

echo "✅ Security enhancements configured"

# Check environment variables
echo ""
echo "🔐 Checking environment security..."

if [ ! -f ".env" ]; then
    echo "❌ .env file not found"
    exit 1
fi

if grep -q "DELETION_TOKEN_PEPPER=change-me" .env; then
    echo "❌ Using default deletion token pepper"
    echo "   Generate a secure pepper with: openssl rand -hex 32"
    exit 1
fi

if grep -q "DELETION_TOKEN_PEPPER=dev-pepper" .env; then
    echo "⚠️  Using development pepper (not recommended for production)"
else
    echo "✅ Secure deletion token pepper configured"
fi

# Check Docker security
echo ""
echo "🐳 Checking Docker security..."

if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running"
    exit 1
fi

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo "⚠️  Running as root (security risk)"
else
    echo "✅ Running as non-root user"
fi

# Check container security
if docker compose ps | grep -q "Up"; then
    echo "✅ Containers are running"
    
    # Check if containers are using security overrides
    if docker compose ps | grep -q "delirium-server"; then
        echo "✅ Server container is running"
    fi
    
    if docker compose ps | grep -q "delirium-web"; then
        echo "✅ Web container is running"
    fi
else
    echo "⚠️  No containers are running"
fi

# Check network security
echo ""
echo "🌐 Checking network security..."

# Check if services are accessible
if curl -s -f http://localhost:8080/api/health > /dev/null 2>&1; then
    echo "✅ Health endpoint accessible"
else
    echo "⚠️  Health endpoint not accessible"
fi

# Check security headers
echo ""
echo "🛡️  Checking security headers..."

HEADERS=$(curl -s -I http://localhost:8080/ | head -20)

if echo "$HEADERS" | grep -q "X-Content-Type-Options"; then
    echo "✅ X-Content-Type-Options header present"
else
    echo "❌ X-Content-Type-Options header missing"
fi

if echo "$HEADERS" | grep -q "Content-Security-Policy"; then
    echo "✅ Content-Security-Policy header present"
else
    echo "❌ Content-Security-Policy header missing"
fi

if echo "$HEADERS" | grep -q "Referrer-Policy"; then
    echo "✅ Referrer-Policy header present"
else
    echo "❌ Referrer-Policy header missing"
fi

# Check file permissions
echo ""
echo "📁 Checking file permissions..."

if [ -f ".env" ]; then
    PERMS=$(stat -f%A .env 2>/dev/null || stat -c%a .env 2>/dev/null)
    if [ "$PERMS" = "600" ] || [ "$PERMS" = "640" ]; then
        echo "✅ .env file has secure permissions"
    else
        echo "⚠️  .env file permissions: $PERMS (should be 600 or 640)"
    fi
fi

# Check log files
if [ -d "logs" ]; then
    echo "✅ Log directory exists"
    if [ -f "logs/monitor.log" ]; then
        echo "✅ Monitoring logs exist"
    fi
else
    echo "⚠️  Log directory not found"
fi

# Check backup files
if [ -d "backups" ]; then
    echo "✅ Backup directory exists"
    BACKUP_COUNT=$(find backups -name "*.tar.gz" 2>/dev/null | wc -l)
    if [ "$BACKUP_COUNT" -gt 0 ]; then
        echo "✅ $BACKUP_COUNT backup files found"
    else
        echo "⚠️  No backup files found"
    fi
else
    echo "⚠️  Backup directory not found"
fi

# System security checks
echo ""
echo "🖥️  Checking system security..."

# Check disk space
DISK_USAGE=$(df -h . | tail -1 | awk '{print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -lt 90 ]; then
    echo "✅ Disk usage: ${DISK_USAGE}%"
else
    echo "⚠️  Disk usage is high: ${DISK_USAGE}%"
fi

# Check if firewall is configured (if available)
if command -v ufw > /dev/null 2>&1; then
    if ufw status | grep -q "Status: active"; then
        echo "✅ UFW firewall is active"
    else
        echo "⚠️  UFW firewall is not active"
    fi
elif command -v iptables > /dev/null 2>&1; then
    if iptables -L | grep -q "ACCEPT"; then
        echo "✅ iptables firewall rules found"
    else
        echo "⚠️  No iptables firewall rules found"
    fi
else
    echo "ℹ️  No firewall detected (may be managed by cloud provider)"
fi

echo ""
echo "🎯 Security Check Summary:"
echo "=========================="

# Count issues
ISSUES=0
if ! grep -q "DELETION_TOKEN_PEPPER=" .env || grep -q "DELETION_TOKEN_PEPPER=change-me" .env; then
    ISSUES=$((ISSUES + 1))
fi

if [ "$EUID" -eq 0 ]; then
    ISSUES=$((ISSUES + 1))
fi

if [ "$DISK_USAGE" -gt 90 ]; then
    ISSUES=$((ISSUES + 1))
fi

if [ "$ISSUES" -eq 0 ]; then
    echo "✅ All security checks passed!"
    echo "🛡️  Your Delirium deployment is secure for headless environments"
else
    echo "⚠️  $ISSUES security issues found"
    echo "🔧 Please address the issues above for optimal security"
fi

echo ""
echo "📋 Next steps:"
echo "- Run 'make monitor' for continuous monitoring"
echo "- Run 'make backup' to create regular backups"
echo "- Review SECURITY_CHECKLIST.md for additional hardening"
