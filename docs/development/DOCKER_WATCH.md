# Docker Watch Development Mode

Docker watch provides automatic file synchronization between your local filesystem and Docker containers, enabling a seamless hot-reload development experience.

## What is Docker Watch?

Docker watch (available in Docker Compose v2.22+) monitors your local files and automatically:
- **Syncs** file changes to running containers (for client files)
- **Rebuilds** containers when source code changes (for server changes)

This eliminates the need to manually restart containers or rebuild images during development.

## Quick Start

```bash
make dev-watch
```

This single command:
1. Builds the TypeScript client
2. Starts Docker services (server + postgres)
3. Enables Docker watch for automatic file syncing
4. Starts TypeScript watch for automatic recompilation
5. Provides live-reloading for both client and server changes

## What Gets Synced?

### Client Files (Instant Sync)
The following client files are automatically synced to the server container (which serves
static files from `/app/static/`):
- `client/js/` → Compiled JavaScript files
- `client/styles/` → CSS files
- `client/*.html` → HTML pages (index, view, delete)
- `client/favicon.svg` → Favicon
- `client/vendor/` → Vendored libraries

In dev mode, `./client/` is volume-mounted to `/app/static/` for hot-reload.
**Changes are reflected immediately** - just refresh your browser!

### Server Files (Rebuild on Change)
Server changes trigger a container rebuild:
- `server/src/` → Kotlin source files
- `server/BUILD.bazel` → Build configuration
- `server/Dockerfile` → Docker configuration

**Note**: Server rebuilds take 30-60 seconds due to Bazel compilation.

## Development Workflow

### Typical Workflow
1. Start development environment:
   ```bash
   make dev-watch
   ```

2. Open the application in your browser:
   ```bash
   http://localhost:8080  # Frontend + API (Ktor server)
   ```

3. Edit files:
   - **Client TypeScript** (`client/src/*.ts`): TypeScript watch compiles → volume mount reflects changes → refresh browser
   - **Client HTML/CSS**: Edited → volume mount reflects changes → refresh browser
   - **Server Kotlin**: Edited → Docker watch rebuilds container → wait ~60s

4. Stop development environment:
   - Press `Ctrl+C` (gracefully stops all services)

### Monitoring TypeScript Compilation

The TypeScript watch process runs in the background. To monitor it:

```bash
tail -f /tmp/typescript-watch.log
```

### Manual Commands

If you prefer more control, you can run components separately:

```bash
# Terminal 1: TypeScript watch
cd client
npm run watch

# Terminal 2: Docker watch
docker compose -f docker-compose.yml -f docker-compose.dev.yml watch

# Terminal 3: View logs
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f
```

## Requirements

- **Docker Desktop 4.24+** or **Docker Compose v2.22+**
- **Node.js 18+** (for TypeScript compilation)
- **Bazel** (for server builds, installed in Docker image)

### Checking Docker Compose Version

```bash
docker compose version
```

If your version is older than 2.22.0, update Docker Desktop or the docker-compose plugin.

## Configuration

The watch configuration is defined in `docker-compose.dev.yml`:

```yaml
services:
  server:
    develop:
      watch:
        - action: rebuild
          path: ./server/src
          target: /app/src
        # ... more rebuild rules
```

In dev mode, client files are served via a volume mount (`./client/:/app/static/`)
so no Docker watch sync rules are needed for frontend files.

### Watch Actions

- **`sync`**: Copy files from host to container (fast, no rebuild)
- **`rebuild`**: Rebuild and restart the container (slower, for source changes)

## Alternative: Traditional Dev Mode

If you prefer the traditional approach without Docker watch:

```bash
make dev
```

This runs:
- Backend in Docker
- TypeScript watch locally (via `scripts/dev.sh`)

## Troubleshooting

### Docker watch not syncing files

**Cause**: Docker Compose version too old

**Solution**:
```bash
# Check version
docker compose version

# Update Docker Desktop or install newer docker-compose
# macOS/Windows: Update Docker Desktop
# Linux: Update docker-compose plugin
```

### TypeScript changes not compiling

**Check if TypeScript watch is running**:
```bash
# Check the log
tail -f /tmp/typescript-watch.log

# Or start manually in separate terminal
cd client
npm run watch
```

### Server changes not rebuilding

**Verify watch is monitoring server files**:
```bash
# Check Docker Compose logs
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f

# Manually rebuild if needed
docker compose -f docker-compose.yml -f docker-compose.dev.yml build server
```

### Port conflicts (8080 already in use)

**Stop conflicting services**:
```bash
# Find process using port
lsof -i :8080

# Stop Delirium services
make stop

# Or kill specific process
kill -9 <PID>
```

### Changes not reflected in browser

1. **Hard refresh**: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (macOS)
2. **Check sync logs**: Look for sync events in Docker Compose output
3. **Verify TypeScript compiled**: Check `client/js/` directory for updated files
4. **Check browser cache**: Open DevTools → Network tab → Disable cache

## Performance Tips

1. **Exclude unnecessary files**: The watch configuration already excludes `node_modules`, build artifacts, etc.
2. **Use sync for static files**: HTML, CSS, JS are synced (fast) rather than rebuilt (slow)
3. **Server changes are slower**: Kotlin/Bazel rebuilds take time - batch your server changes when possible
4. **Browser auto-refresh**: Use a browser extension like LiveReload for automatic page refresh

## Docker Watch vs Traditional Dev Mode

| Feature | `make dev-watch` | `make dev` |
|---------|------------------|------------|
| TypeScript hot-reload | ✅ Automatic | ✅ Automatic |
| Client file sync | ✅ Docker watch | ❌ Manual refresh |
| Server hot-reload | ✅ Auto-rebuild | ❌ Manual restart |
| Setup complexity | Simple (1 command) | Simple (1 command) |
| Requirements | Docker 2.22+ | Docker (any) |
| Performance | Slightly better | Good |

**Recommendation**: Use `make dev-watch` for the best development experience if you have Docker Compose 2.22+.

## Related Commands

```bash
make start              # Production-like start (no watch)
make dev                # Traditional dev mode (no Docker watch)
make dev-watch          # Docker watch mode (recommended)
make stop               # Stop all services
make logs               # View container logs
make restart            # Restart services
make clean              # Clean up containers and volumes
```

## See Also

- [Docker Compose Watch Documentation](https://docs.docker.com/compose/file-watch/)
- [Delirium SETUP.md](../getting-started/SETUP.md)
- [Delirium CLAUDE.md](../../CLAUDE.md)
