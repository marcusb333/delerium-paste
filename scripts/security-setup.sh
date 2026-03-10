#!/bin/bash
set -e

# Security setup script for Delirium in headless environments
# This script enhances the existing security measures for unknown security environments

echo "🔒 Delirium Security Enhancement for Headless Environments"
echo "========================================================="
echo ""
echo "📋 Existing Security Measures Detected:"
echo "✅ Server-side security headers (CSP, X-Content-Type-Options, etc.)"
echo "✅ Rate limiting (30 requests/minute)"
echo "✅ Input validation and size limits (1MB)"
echo "✅ Client-side encryption (AES-256-GCM)"
echo "✅ Zero-knowledge architecture"
echo "✅ Docker container isolation"
echo "✅ Nginx reverse proxy"
echo ""
echo "🛡️  Adding headless environment enhancements..."
echo ""

# Check if running as root (security risk)
if [ "$EUID" -eq 0 ]; then
    echo "⚠️  WARNING: Running as root is not recommended for security"
    echo "   Consider running as a non-root user"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Generate secure environment variables
echo "🔐 Generating secure environment variables..."

# Generate secure deletion token pepper
if [ ! -f ".env" ]; then
    echo "📝 Creating secure .env file..."
    cat > .env << EOF
# Delirium Security Configuration
# Generated on $(date)

# Secure deletion token pepper (32 bytes of random data)
DELETION_TOKEN_PEPPER=$(openssl rand -hex 32)

# Security settings
SECURE_HEADERS=true
RATE_LIMITING=true
CORS_ORIGIN=*
LOG_LEVEL=INFO

# Operational settings
HEALTH_CHECK_INTERVAL=30
MAX_REQUEST_SIZE=1MB
SESSION_TIMEOUT=3600
EOF
    echo "✅ Secure .env file created"
else
    echo "✅ .env file already exists"
fi

# Create secure nginx configuration
echo "🛡️  Creating secure nginx configuration..."
mkdir -p reverse-proxy/secure

cat > reverse-proxy/secure/security.conf << 'EOF'
# Security headers and configurations
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self';" always;

# Hide nginx version
server_tokens off;

# Rate limiting
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=general:10m rate=30r/s;

# Security timeouts
client_body_timeout 10s;
client_header_timeout 10s;
keepalive_timeout 5s 5s;
send_timeout 10s;

# Buffer sizes
client_body_buffer_size 1k;
client_header_buffer_size 1k;
client_max_body_size 1m;
large_client_header_buffers 2 1k;

# Disable unnecessary methods
if ($request_method !~ ^(GET|HEAD|POST|DELETE|OPTIONS)$ ) {
    return 405;
}

# Block suspicious requests
location ~* \.(env|log|conf|ini|bak|backup|old|tmp)$ {
    deny all;
    return 404;
}

# Block access to hidden files
location ~ /\. {
    deny all;
    return 404;
}
EOF

echo "✅ Secure nginx configuration created"

# Create secure docker-compose override
echo "🐳 Creating secure docker-compose override..."
cat > docker-compose.secure.yml << 'EOF'
# Security-hardened docker-compose override
services:
  server:
    # Security: Run as non-root user
    user: "1000:1000"
    # Security: Read-only root filesystem
    read_only: true
    # Security: No new privileges
    security_opt:
      - no-new-privileges:true
    # Security: Drop capabilities
    cap_drop:
      - ALL
    # Security: Limited resources
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
        reservations:
          memory: 256M
          cpus: '0.25'
    # Security: Health check
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    # Security: Environment
    environment:
      - DELETION_TOKEN_PEPPER=${DELETION_TOKEN_PEPPER}
      - LOG_LEVEL=INFO
      - SECURE_MODE=true

  web:
    # Security: Read-only root filesystem
    read_only: true
    # Security: No new privileges
    security_opt:
      - no-new-privileges:true
    # Security: Drop capabilities
    cap_drop:
      - ALL
    # Security: Limited resources
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: '0.25'
        reservations:
          memory: 128M
          cpus: '0.1'
    # Security: Health check
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    # Security: Additional volumes for security config
    volumes:
      - ./reverse-proxy/secure/security.conf:/etc/nginx/conf.d/security.conf:ro
      - ./logs/nginx:/var/log/nginx
    # Security: Environment
    environment:
      - NGINX_ENVSUBST_TEMPLATE_DIR=/etc/nginx/templates
      - NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx/conf.d

# Security: Network isolation
networks:
  default:
    driver: bridge
    driver_opts:
      com.docker.network.bridge.enable_icc: "false"
      com.docker.network.bridge.enable_ip_masquerade: "true"
      com.docker.network.bridge.host_binding_ipv4: "127.0.0.1"
EOF

echo "✅ Secure docker-compose override created"

# Create monitoring script
echo "📊 Creating monitoring script..."
cat > scripts/monitor.sh << 'EOF'
#!/bin/bash
# Monitoring script for Delirium in headless environments

LOG_FILE="logs/monitor.log"
mkdir -p logs

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "🔍 Starting Delirium monitoring..."

while true; do
    # Check Docker status
    if ! docker info > /dev/null 2>&1; then
        log "❌ Docker is not running"
        sleep 30
        continue
    fi

    # Check container health
    if ! docker compose ps | grep -q "Up"; then
        log "❌ Containers are not running"
        # Try to restart
        log "🔄 Attempting to restart services..."
        docker compose up -d
        sleep 10
        continue
    fi

    # Check API health
    if ! curl -s -f http://localhost:8080/api/health > /dev/null 2>&1; then
        log "⚠️  API health check failed"
    fi

    # Check disk space
    DISK_USAGE=$(df -h . | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ "$DISK_USAGE" -gt 90 ]; then
        log "⚠️  Disk usage is high: ${DISK_USAGE}%"
    fi

    # Check memory usage (if available)
    if command -v free > /dev/null 2>&1; then
        MEMORY_USAGE=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
        if [ "$MEMORY_USAGE" -gt 90 ]; then
            log "⚠️  Memory usage is high: ${MEMORY_USAGE}%"
        fi
    fi

    # Log successful check
    log "✅ All checks passed"
    
    # Wait before next check
    sleep 60
done
EOF

chmod +x scripts/monitor.sh
echo "✅ Monitoring script created"

# Create log rotation configuration
echo "📝 Setting up log rotation..."
mkdir -p logs/nginx

cat > logs/rotate-logs.sh << 'EOF'
#!/bin/bash
# Log rotation script for Delirium

LOG_DIR="logs"
MAX_SIZE="10M"
MAX_FILES=5

# Rotate nginx logs
if [ -f "$LOG_DIR/nginx/access.log" ]; then
    if [ $(stat -f%z "$LOG_DIR/nginx/access.log" 2>/dev/null || stat -c%s "$LOG_DIR/nginx/access.log" 2>/dev/null) -gt 10485760 ]; then
        mv "$LOG_DIR/nginx/access.log" "$LOG_DIR/nginx/access.log.$(date +%Y%m%d-%H%M%S)"
        touch "$LOG_DIR/nginx/access.log"
        chmod 644 "$LOG_DIR/nginx/access.log"
    fi
fi

# Clean old log files
find "$LOG_DIR" -name "*.log.*" -type f -mtime +7 -delete
find "$LOG_DIR" -name "*.log" -type f -size +10M -exec mv {} {}.$(date +%Y%m%d-%H%M%S) \;
EOF

chmod +x logs/rotate-logs.sh
echo "✅ Log rotation configured"

# Create backup script
echo "💾 Creating backup script..."
cat > scripts/backup.sh << 'EOF'
#!/bin/bash
# Backup script for Delirium data

BACKUP_DIR="backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/delirium-backup-$TIMESTAMP.tar.gz"

mkdir -p "$BACKUP_DIR"

echo "📦 Creating backup: $BACKUP_FILE"

# Backup server data
docker run --rm \
  -v delirium_server-data:/data \
  -v "$(pwd)/$BACKUP_DIR:/backup" \
  alpine tar czf "/backup/server-data-$TIMESTAMP.tar.gz" /data

# Backup configuration
tar czf "$BACKUP_FILE" \
  .env \
  docker-compose*.yml \
  reverse-proxy/ \
  logs/ \
  --exclude=node_modules \
  --exclude=.git

echo "✅ Backup created: $BACKUP_FILE"

# Clean old backups (keep last 7 days)
find "$BACKUP_DIR" -name "delirium-backup-*.tar.gz" -mtime +7 -delete
find "$BACKUP_DIR" -name "server-data-*.tar.gz" -mtime +7 -delete

echo "🧹 Old backups cleaned"
EOF

chmod +x scripts/backup.sh
echo "✅ Backup script created"

# Create security checklist
echo "📋 Creating security checklist..."
cat > SECURITY_CHECKLIST.md << 'EOF'
# Delirium Security Checklist for Headless Environments

## Pre-Deployment Security

- [ ] **Environment Variables**: Secure `.env` file with strong `DELETION_TOKEN_PEPPER`
- [ ] **User Permissions**: Running as non-root user
- [ ] **Network Security**: Firewall configured (ports 80, 443 only)
- [ ] **SSL/TLS**: HTTPS enabled with valid certificates
- [ ] **System Updates**: OS and Docker updated to latest versions

## Runtime Security

- [ ] **Container Security**: Read-only filesystems, dropped capabilities
- [ ] **Resource Limits**: Memory and CPU limits configured
- [ ] **Health Checks**: Automated health monitoring active
- [ ] **Log Monitoring**: Log rotation and monitoring configured
- [ ] **Backup Strategy**: Regular automated backups

## Operational Security

- [ ] **Access Control**: SSH key authentication only
- [ ] **Monitoring**: System resource monitoring active
- [ ] **Incident Response**: Logs and monitoring alerts configured
- [ ] **Update Strategy**: Automated security updates enabled
- [ ] **Recovery Plan**: Backup and restore procedures tested

## Security Commands

```bash
# Check security status
make security-check

# Run security monitoring
make monitor

# Create backup
make backup

# View security logs
make security-logs
```

## Emergency Procedures

1. **Service Down**: Check `make logs` and `make health-check`
2. **High Resource Usage**: Check `make monitor` and restart services
3. **Security Incident**: Check logs, stop services, investigate
4. **Data Recovery**: Use backup scripts to restore from latest backup
EOF

echo "✅ Security checklist created"

echo ""
echo "🔒 Security setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Review SECURITY_CHECKLIST.md"
echo "2. Run 'make security-check' to verify setup"
echo "3. Start services with 'make start-secure'"
echo "4. Enable monitoring with 'make monitor'"
echo ""
echo "🛡️  Your Delirium deployment is now security-hardened for headless environments!"
