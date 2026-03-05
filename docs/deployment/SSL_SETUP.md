# SSL/HTTPS Setup Guide for Delirium

This guide walks you through setting up HTTPS with Let's Encrypt SSL certificates for your Delirium pastebin deployment.

## Prerequisites

- A domain name pointed to your VPS IP address (A record)
- SSH access to your VPS
- Docker and Docker Compose installed
- Ports 80 and 443 open in your firewall

## Step 1: Verify Domain DNS

Before getting SSL certificates, verify your domain is pointing to your VPS:

```bash
# Check if DNS is propagated
dig +short YOUR_DOMAIN.com

# Should return your VPS IP (e.g., 203.0.113.10)
```

Wait for DNS propagation if needed (can take 5 minutes to 24 hours).

## Step 2: Install Certbot

On your VPS, install Certbot (Let's Encrypt client):

```bash
# For Ubuntu/Debian
sudo apt update
sudo apt install certbot -y

# For CentOS/RHEL
sudo yum install certbot -y
```

## Step 3: Get SSL Certificates

**Important:** Stop Docker containers first so port 80 is available:

```bash
cd ~/delerium
docker compose down
```

Now get your SSL certificate:

```bash
# Replace YOUR_DOMAIN with your actual domain
sudo certbot certonly --standalone \
  -d YOUR_DOMAIN.com \
  --non-interactive \
  --agree-tos \
  --email YOUR_EMAIL@example.com

# Certificate will be saved to:
# /etc/letsencrypt/live/YOUR_DOMAIN.com/fullchain.pem
# /etc/letsencrypt/live/YOUR_DOMAIN.com/privkey.pem
```

## Step 4: Copy Certificates to Project

Create SSL directory and copy certificates:

```bash
cd ~/delerium

# Create SSL directory
mkdir -p ssl

# Copy certificates (need sudo)
sudo cp /etc/letsencrypt/live/YOUR_DOMAIN.com/fullchain.pem ssl/
sudo cp /etc/letsencrypt/live/YOUR_DOMAIN.com/privkey.pem ssl/

# Set proper permissions
sudo chown $USER:$USER ssl/*.pem
chmod 644 ssl/fullchain.pem
chmod 600 ssl/privkey.pem
```

## Step 5: Configure TLS Termination

Since the Ktor server handles both the API and static frontend, you need a TLS
termination layer in front of it. Options include:

- **Kubernetes Ingress** with cert-manager (recommended for K8s deployments)
- **External reverse proxy** (nginx, Caddy, Traefik) that forwards to `localhost:8080`

If using an external nginx reverse proxy, configure it to forward all traffic to
the Ktor server on port 8080.

## Step 6: Update Docker Compose

The `docker-compose.prod.yml` is already configured for HTTPS. Verify it looks correct:

```bash
cat docker-compose.prod.yml | grep -A 5 "ports:"
```

Should show:

```yaml
ports:
  - "80:80"
  - "443:443"
```

## Step 7: Set Environment Variables

Create a `.env` file for production secrets:

```bash
cd ~/delerium

# Create .env file
cat > .env << 'EOF'
# IMPORTANT: Change this to a random secret value!
DELETION_TOKEN_PEPPER=YOUR_RANDOM_SECRET_HERE_CHANGE_THIS
EOF

# Generate a random pepper (or use your own)
echo "DELETION_TOKEN_PEPPER=$(openssl rand -base64 32)" > .env
```

## Step 8: Deploy with HTTPS

Now start the production deployment:

```bash
cd ~/delerium

# Pull latest code
git pull origin main

# Start with production compose file
docker compose -f docker-compose.prod.yml up --build -d

# Check if containers are running
docker compose -f docker-compose.prod.yml ps

# Check logs
docker compose -f docker-compose.prod.yml logs -f
```

## Step 9: Test HTTPS

Visit your site:

- `https://YOUR_DOMAIN.com` - should work with valid SSL!
- `http://YOUR_DOMAIN.com` - should redirect to HTTPS

Check for the padlock icon in your browser 🔒

## Step 10: Set Up Auto-Renewal

Let's Encrypt certificates expire after 90 days. Set up automatic renewal:

```bash
# Test renewal (dry run)
sudo certbot renew --dry-run

# If successful, create a renewal script
sudo tee /etc/cron.d/certbot-renew << 'EOF'
# Renew Let's Encrypt certificates twice daily and copy to project
0 */12 * * * root certbot renew --quiet --post-hook "cp /etc/letsencrypt/live/YOUR_DOMAIN.com/*.pem /home/noob/delerium/ssl/ && chown noob:noob /home/noob/delerium/ssl/*.pem && docker compose -f /home/noob/delerium/docker-compose.prod.yml restart web"
EOF

# Replace YOUR_DOMAIN.com and paths as needed
```

**Or use systemd timer** (if available):

```bash
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
sudo systemctl status certbot.timer
```

## Troubleshooting

### Certificate Error: "Connection Refused"

Make sure ports 80 and 443 are open:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw reload
```

### "Unable to find expected file" Error

The SSL certificate paths might be wrong. Check:

```bash
sudo ls -la /etc/letsencrypt/live/YOUR_DOMAIN.com/
```

### Containers Won't Start

Check logs:

```bash
docker compose -f docker-compose.prod.yml logs web
docker compose -f docker-compose.prod.yml logs server
```

### Web Crypto API Still Doesn't Work

1. Verify you're accessing via HTTPS (not HTTP)
2. Clear browser cache
3. Check browser console for errors
4. Verify SSL certificate is valid (no warnings)

## Security Checklist

- [ ] SSL certificates installed and valid
- [ ] HTTP → HTTPS redirect working
- [ ] DELETION_TOKEN_PEPPER set to random value (not default)
- [ ] Security headers enabled (HSTS, CSP, X-Frame-Options)
- [ ] Rate limiting enabled (10 req/min on API)
- [ ] Firewall configured (ports 80, 443, 22 only)
- [ ] Auto-renewal configured
- [ ] Regular backups configured

## Maintenance

### Update SSL Certificates Manually

```bash
sudo certbot renew
sudo cp /etc/letsencrypt/live/YOUR_DOMAIN.com/*.pem ~/delerium/ssl/
sudo chown $USER:$USER ~/delerium/ssl/*.pem
cd ~/delerium
docker compose -f docker-compose.prod.yml restart web
```

### Check Certificate Expiry

```bash
sudo certbot certificates
```

### View Nginx Logs

```bash
cd ~/delerium
docker compose -f docker-compose.prod.yml logs web
# Or check mounted logs
tail -f logs/nginx/access.log
tail -f logs/nginx/error.log
```

## Need Help?

- Let's Encrypt documentation: <https://letsencrypt.org/docs/>
- Certbot documentation: <https://certbot.eff.org/>
- Nginx SSL configuration: <https://ssl-config.mozilla.org/>

---

**After setup is complete**, your Delirium instance will be:

- ✅ Accessible via HTTPS
- ✅ Auto-redirecting HTTP to HTTPS
- ✅ Using modern TLS 1.2/1.3
- ✅ Protected with security headers
- ✅ Rate limited to prevent abuse
- ✅ Auto-renewing certificates
