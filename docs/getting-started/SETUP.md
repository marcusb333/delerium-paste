# Setup Guide

This guide explains how to configure your secrets and get Delirium running locally or in production.

## Quick Start

### Option 1: Interactive Setup Wizard (Recommended)

The easiest way to configure your secrets:

```bash
./scripts/setup.sh
# or
make setup
```

The wizard will guide you through:

1. **Choose Environment Type**
   - Local Development (auto-generates development-friendly secrets)
   - Production/VPS (prompts for production-grade configuration)

2. **Configure Secrets**
   - **Auto-generate**: Let the script create a secure random pepper (recommended)
   - **Manual entry**: Enter your own secret if you prefer

3. **Optional Settings** (Production only)
   - Domain name (e.g., `paste.example.com`)
   - Let's Encrypt email for SSL certificates

4. **Start Services**
   - Option to start Docker containers immediately
   - Automatic health checks
   - Browser opening (if not in headless mode)

### Option 2: Quick Automated Setup

For experienced users who want fast setup:

```bash
make quick-start
```

This will:

- Check all prerequisites
- Auto-generate secure secrets
- Install dependencies
- Build the client
- Start all services
- Open your browser automatically

### Option 3: Manual Configuration

1. **Copy the example file:**

   ```bash
   cp .env.example .env
   ```

2. **Generate a secure secret:**

   ```bash
   openssl rand -hex 32
   ```

3. **Edit `.env` and paste your secret:**

   ```bash
   DELETION_TOKEN_PEPPER=your_generated_secret_here
   ```

4. **Start services:**

   ```bash
   make start
   ```

   To use a locally built server image instead of pulling from the registry:

   ```bash
   make build-server-image && make start
   ```

## Where Secrets Go

**All secrets go in `.env` file in the project root:**

```text
delerium-paste/
├─ .env          🔒 Your secrets go here (never committed to git)
├─ .env.example  📄 Template (safe to commit)
├─ ...
```

## Required Secrets

| Secret | What it does | How to generate | Example |
|--------|--------------|-----------------|---------|
| `DELETION_TOKEN_PEPPER` | Hashes deletion tokens securely | `openssl rand -hex 32` | `8d2eaa...fa8281d` |

### DELETION_TOKEN_PEPPER (Required)

**What it is:** A secret string used to hash deletion tokens before storing them in the database.

**Why it matters:** This prevents attackers from using stolen database dumps to delete pastes.

**Security requirements:**

- ✅ **At least 64 characters** (recommended)
- ✅ **Cryptographically random** (use `openssl rand -hex 32`)
- ✅ **Unique per environment** (different for dev/staging/production)
- ✅ **Never committed to git** (already in `.gitignore`)
- ✅ **Rotate periodically** (every 3-6 months)

**Example:**

```bash
DELETION_TOKEN_PEPPER=8d2eaa7238c33056796c0b6f516c3961cceea56f9d41bbc8a8bb7dfc0fa8281d
```

## Optional Secrets (Production Only)

| Secret | When to use | Example |
|--------|-------------|---------|
| `DOMAIN` | If you have a custom domain | `paste.example.com` |
| `LETSENCRYPT_EMAIL` | For automatic SSL certs | `admin@example.com` |

### DOMAIN (Optional)

**What it is:** Your domain name for SSL/TLS certificates.

**When to use:** Only needed for production deployments with a custom domain.

**Example:**

```bash
DOMAIN=paste.example.com
```

### LETSENCRYPT_EMAIL (Optional)

**What it is:** Email address for Let's Encrypt certificate notifications.

**When to use:** Only needed if you're using automatic SSL with Let's Encrypt.

**Example:**

```bash
LETSENCRYPT_EMAIL=admin@example.com
```

## Environment-Specific Configuration

### Local Development

```bash
# .env for local development
DELETION_TOKEN_PEPPER=dev-pepper-$(openssl rand -hex 16)
```

You can use a shorter pepper for development, but still make it random!

### Production/VPS

```bash
# .env for production
DELETION_TOKEN_PEPPER=$(openssl rand -hex 32)
DOMAIN=paste.yourdomain.com
LETSENCRYPT_EMAIL=you@yourdomain.com
```

Use the full 64-character pepper and configure your domain for SSL.

## Development Workflow

### Standard Development Mode

For active development with hot-reloading:

```bash
make dev
```

This starts:
- The Ktor server in Docker (serves both API and static frontend)
- TypeScript watch mode for automatic recompilation

Access the app at `http://localhost:8080` and edit files - TypeScript will automatically recompile on save.

### Docker Watch Mode (Recommended)

For the best development experience with automatic file syncing:

```bash
make dev-watch
```

This enables:
- **Automatic file syncing** from your filesystem to Docker containers
- **TypeScript hot-reload** for instant compilation
- **Live changes** reflected immediately (just refresh browser)
- **Server auto-rebuild** when Kotlin code changes

**Requirements**: Docker Compose v2.22+ (included in Docker Desktop 4.24+)

See [Docker Watch Documentation](../development/DOCKER_WATCH.md) for detailed usage.

### Manual Start (No Watch)

If you just want to build and run without hot-reloading:

```bash
make start
```

This builds the client once and starts all services. You'll need to manually rebuild and restart when making changes.

## Security Best Practices

### ✅ DO

- Use the interactive setup wizard for first-time setup
- Generate secrets using `openssl rand -hex 32`
- Use different secrets for each environment (dev, staging, prod)
- Store production secrets in a password manager
- Rotate secrets periodically (every 3-6 months)
- Check `.gitignore` includes `.env`

### ❌ DON'T

- Never commit `.env` to version control
- Never use weak passwords or predictable patterns
- Never reuse secrets across environments
- Never share secrets in plain text (Slack, email, etc.)
- Never use the example values from `.env.example`

## Common Mistakes

| ❌ Don't Do This | ✅ Do This Instead |
|-----------------|-------------------|
| `DELETION_TOKEN_PEPPER=password123` | `DELETION_TOKEN_PEPPER=$(openssl rand -hex 32)` |
| Commit `.env` to git | Keep `.env` in `.gitignore` |
| Use same secret in dev and prod | Generate separate secrets per environment |
| Share secrets in Slack/email | Use password managers or secret management tools |

## Troubleshooting

### "DELETION_TOKEN_PEPPER not set"

**Problem:** Docker container can't find the environment variable.

**Solution:**

```bash
# 1. Check .env file exists
ls -la .env

# 2. Verify it contains the pepper
cat .env | grep DELETION_TOKEN_PEPPER

# 3. Restart services to pick up changes
docker-compose down
docker-compose up -d
```

### "Secret is too short"

**Problem:** Your pepper is less than 32 characters.

**Solution:**

```bash
# Generate a proper 64-character secret
echo "DELETION_TOKEN_PEPPER=$(openssl rand -hex 32)" > .env

# Then add other configs as needed
echo "DOMAIN=your.domain.com" >> .env
```

### "Permission denied: ./scripts/setup.sh"

**Problem:** Script is not executable.

**Solution:**

```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

### I lost my pepper

**Problem:** You can't find your DELETION_TOKEN_PEPPER.

**Solution:**

```bash
# Generate a new one (note: users will need new deletion tokens)
echo "DELETION_TOKEN_PEPPER=$(openssl rand -hex 32)" > .env
docker-compose restart
```

## Example Setup Sessions

### Example 1: Local Development (Quick)

```bash
$ ./scripts/setup.sh

Choose environment: 1 (Local Development)
Use generated pepper? yes
Start services now? yes

✅ Done! Access at http://localhost:8080
```

### Example 2: Production (Full Configuration)

```bash
$ ./scripts/setup.sh

Choose environment: 2 (Production/VPS)
Use generated pepper? yes
Domain: paste.example.com
Email: admin@example.com
Start services now? yes

✅ Done! Access at https://paste.example.com
```

### Example 3: Headless Server

```bash
$ HEADLESS=1 ./scripts/setup.sh

# Same prompts, but skips browser opening
# Perfect for SSH sessions and CI/CD
```

## Security Checklist

Before going to production, verify:

- [ ] Run `./scripts/setup.sh` or generate secrets with `openssl rand -hex 32`
- [ ] Never use the example values from `.env.example`
- [ ] Verify `.env` is in `.gitignore` (already done ✅)
- [ ] Use different secrets for dev/staging/production
- [ ] Store production secrets in a password manager
- [ ] Rotate secrets every 3-6 months
- [ ] Document where you stored your secrets (for your team)
- [ ] Test locally first before deploying to production

## FAQ

**Q: Can I see my pepper after it's set?**  
A: Yes, it's in your `.env` file: `cat .env`

**Q: What happens if I lose my pepper?**  
A: Users won't be able to delete their pastes with their deletion tokens. You'll need to rotate it and inform users.

**Q: Can I change my pepper later?**  
A: Yes, but existing deletion tokens won't work. Best to rotate during maintenance windows.

**Q: Do I need different peppers for dev and prod?**  
A: YES! Always use different secrets per environment.

**Q: How do I rotate my pepper?**  
A:

```bash
# 1. Generate new pepper
NEW_PEPPER=$(openssl rand -hex 32)

# 2. Update .env
sed -i "s/DELETION_TOKEN_PEPPER=.*/DELETION_TOKEN_PEPPER=$NEW_PEPPER/" .env

# 3. Restart services
docker-compose restart
```

**Q: Is the setup wizard secure?**  
A: Yes! It uses `openssl rand` for cryptographic randomness and never logs secrets.

## Pro Tips

1. **Use the wizard!** It explains everything as you go
2. **Store backups** of your production `.env` in a password manager
3. **Document** where you stored your secrets (for your team)
4. **Rotate regularly** - set a calendar reminder for every 6 months
5. **Test locally first** before deploying to production

## Next Steps

- 📖 Read the [README.md](../random/README.md) for general documentation
- 🔒 Check [Security Documentation](../security/CHECKLIST.md) for security guidelines
- 🚀 See [Deployment Guide](../deployment/DEPLOYMENT.md) for production deployment
- 📝 Review [scripts/DEMO_SETUP.md](../../scripts/DEMO_SETUP.md) for setup examples
- 💬 Open an issue on GitHub for bugs or questions

---

**Happy pasting! 📋** Remember: Your secrets are what keep your users' data safe. Treat them with care!
