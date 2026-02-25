# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Delirium** is a zero-knowledge encrypted paste system where all encryption happens client-side. The server NEVER sees plaintext content or encryption keys. This is a security-first application with TypeScript frontend and Kotlin backend.

## Core Architecture Principle: Zero-Knowledge

- ALL encryption/decryption occurs in the browser using Web Crypto API (AES-256-GCM)
- Encryption keys are stored in URL fragments (after `#`) which browsers never send to servers
- Server only stores encrypted ciphertext + IV + metadata
- Keys are derived from passwords using PBKDF2 (100,000 iterations)
- Privacy-first: no accounts, no tracking, no analytics

```
User Input → PBKDF2 → AES-256 Key → Encrypt → Upload (without key!)
Share URL: domain.com/view?p=ID#salt:iv  (key stays client-side)
```

## Technology Stack

**Frontend (client/):** TypeScript (strict mode, ES Modules), Web Crypto API, vendored `marked.js` + `highlight.js` (no CDN), Jest + Playwright, ESLint, 85% min coverage

**Backend (server/):** Kotlin + Ktor, SQLite + Exposed, Bazel build, JDK 21+ (Eclipse Temurin 25 JRE)

**Infrastructure:** Docker + Docker Compose, Nginx reverse proxy, multi-arch (AMD64, ARM64, ARM/v7)

---

## CRITICAL: Never Push Directly to Main

**NEVER push to `main` or `master` — not commits, not tags, not anything.** Always work on a feature branch and open a Pull Request.

```
❌ BAD:  git push origin main
❌ BAD:  git push origin master
❌ BAD:  git push origin v1.x.x          ← tags must ONLY be pushed after PR is merged
✅ GOOD: git checkout -b my-feature
✅ GOOD: git push -u origin my-feature
✅ GOOD: gh pr create ...
✅ GOOD: git tag vX.Y.Z && git push origin vX.Y.Z   ← ONLY after PR is merged to main
```

**Mandatory workflow for every change:**
1. Check current branch: `git branch --show-current`
2. **If on `main` or `master`, create a feature branch IMMEDIATELY:** `git checkout -b <description>`
3. Make ALL changes on the feature branch (including version bumps, config changes)
4. Push only to the feature branch
5. Open a PR via `gh pr create` — never merge directly
6. After PR is merged: create and push the git tag, then push to Docker Hub, then create GitHub release

AI assistants MUST create a branch before any implementation work — including trivial one-line changes. Tags must never be pushed before the corresponding commit lands in main via a merged PR.

---

## High-Risk Change Protocol

### Privacy is Non-Negotiable

In a zero-knowledge system, a single mistake can permanently destroy user trust. Extraordinary care is required for changes to:

- **Privacy-critical**: encryption/decryption, key generation/derivation/storage, password handling, data transmission, URL fragment handling, chat encryption, delete authorization
- **Anonymity-critical**: logging, network requests, session management, error messages that could expose internal state
- **Data integrity**: database schema, backup/restore, expiration logic, single-view consumption

### Requirements for High-Risk Changes

1. **Risk assessment** in PR description: what system is changing, what could go wrong, what data could leak, backward compatibility plan, rollback plan
2. **Edge case identification**: document all edge cases relevant to the change (encryption, auth, data handling, browser compat, timing, concurrency, URL/fragment handling, etc.)
3. **100% test coverage** for all changed security-critical code — security paths, edge cases, and failure modes
4. **Security review checklist** before submitting (see Security Requirements section below)

### When to Apply

**ALWAYS** for: `client/src/core/crypto/`, `client/src/security.ts`, `client/src/core/utils/sanitize.ts`, password/auth changes, key derivation, network requests, delete auth, DB schema changes.

**MAY skip** for: UI-only changes (CSS, layout), documentation, build scripts, non-security config.

When in doubt, apply the protocol. See `docs/security/CHECKLIST.md` and `.cursor/rules/workspace.md` for details.

---

## Common Development Commands

### Building & Running
```bash
make quick-start              # First time setup
make dev                      # Development mode (hot-reload)
make dev-watch                # Development with Docker watch (recommended, requires Docker Compose 2.22+)
make build-client             # Compile TypeScript
make start                    # Build client + start Docker services
make stop / make logs         # Stop containers / follow logs
```

### Testing
```bash
make test                     # Run all client tests
cd client && npm run test:unit           # Unit tests only
cd client && npm run test:integration    # Integration tests only
cd client && npm run test:e2e            # Playwright e2e tests
cd client && npm run test:e2e:ui         # Playwright UI mode
cd client && npm run test:coverage       # With coverage report
cd client && npm run test:watch          # Watch mode for TDD
cd client && npm run test:all            # All test types sequentially
```

### Server
```bash
make build-server-bazel       # Build server with Bazel
make test-server-bazel        # Run server tests
```

### Pre-PR Verification
```bash
make ci-check                 # Full CI verification (parallel) — run before every PR
make ci-quick                 # Quick checks (lint, type, tests)
```

### Other
```bash
cd client && npm run typecheck           # Type check only
cd client && npm run lint                # Lint / npm run lint:fix
make clean                               # Remove containers, volumes, artifacts
```

## Directory Structure & Key Files

### Client Architecture

The client follows a layered architecture. **Always read `.ts` source files in `client/src/`, NOT compiled `.js` files.**

```
client/
├── src/
│   ├── app.ts                       # Main entry point (index.html)
│   ├── delete.ts                    # Delete page entry point (delete.html)
│   ├── security.ts                  # Core crypto: encryptWithPassword, decryptWithPassword,
│   │                                #   deriveDeleteAuth, deriveKeyFromPassword, secureClear
│   ├── application/                 # Application layer — use cases and DTOs
│   │   ├── dtos/paste-dtos.ts
│   │   └── use-cases/
│   │       ├── create-paste-use-case.ts  # validate → encrypt → PoW → submit → URL
│   │       ├── view-paste-use-case.ts    # fetch → decrypt → display
│   │       ├── delete-paste-use-case.ts  # Token-based and password-based deletion
│   │       └── chat-use-case.ts          # Send/receive encrypted chat messages
│   ├── core/                        # Domain layer (framework-agnostic)
│   │   ├── crypto/                  # interfaces.ts, aes-gcm.ts, encoding.ts
│   │   ├── models/                  # result.ts (Result<T,E>), paste.ts
│   │   ├── services/
│   │   │   ├── encryption-service.ts # encryptPaste, decryptPaste, encryptChatMessage, deriveDeleteAuth
│   │   │   └── paste-service.ts      # validate, buildShareUrl, parseViewUrl, calculateExpiration
│   │   ├── utils/sanitize.ts        # sanitizeHtml() — REQUIRED before any innerHTML assignment
│   │   └── validators/index.ts      # validateContentSize, validateExpiration, validatePassword
│   ├── features/                    # Legacy feature orchestration (thin wrappers)
│   ├── infrastructure/              # API client (http-client.ts, mock-client.ts), PoW solver
│   ├── presentation/components/     # paste-creator-view, paste-viewer-view, chat-view, password-modal
│   ├── ui/                          # dom-helpers.ts, ui-manager.ts
│   ├── utils/                       # storage.ts, passive-events.ts
│   └── types/vendor.d.ts
├── vendor/                          # marked.min.js, highlight.min.js (vendored, no CDN)
├── styles/                          # design-system.css, components.css, pages.css, chat.css, etc.
├── index.html / view.html / delete.html
├── tests/
│   ├── unit/                        # *.test.ts (crypto, models, validators, features, etc.)
│   ├── integration/                 # chat-api.test.ts
│   ├── load/                        # pow-load.test.ts
│   └── e2e/                         # Playwright *.spec.ts
└── package.json
```

### Server Architecture
```
server/
├── src/main/kotlin/
│   ├── App.kt               # Application setup, DI, config loading
│   ├── Routes.kt            # All API endpoints
│   ├── Storage.kt            # SQLite schema, PasteRepo, chat message repo
│   ├── DataKeyManager.kt    # Server-side AES-256-GCM key rotation for deleteAuth hashes
│   ├── Pow.kt               # PoW challenge generation/verification
│   ├── RateLimiter.kt       # Token bucket rate limiter (per-IP)
│   ├── Models.kt            # Request/response DTOs
│   └── Utils.kt             # Ids.randomId(), base64UrlSize()
├── BUILD.bazel / Dockerfile
└── src/test/kotlin/
```

### Key Reference Files
- `.cursor/rules/workspace.md` — API contract rules, security, testing
- `docs/security/CHECKLIST.md` — Security audit checklist
- `docs/architecture/C4-DIAGRAMS.md` — Architecture diagrams
- `client/tests/README.md` — Testing standards
- `Makefile` — All available commands

## Critical Code Flows

### Paste Creation (`CreatePasteUseCase.execute()`)

1. User enters content + settings in `index.html`
2. `PasteService.validatePasteCreation()` validates size, expiration, password, UTF-8
3. `EncryptionService.encryptPaste()` → PBKDF2 → AES-256-GCM
4. `EncryptionService.deriveDeleteAuth()` (separate PBKDF2 with `salt + ":delete"`)
5. Get PoW challenge → solve → `POST /api/pastes` with `{ct, iv, meta, pow, deleteAuth}`
6. Build share URL: `domain.com/view.html?p=ID#salt:iv` (key only in fragment!)
7. Build delete URL, store delete token in `sessionStorage`

### Paste Viewing (`ViewPasteUseCase`)

1. Parse URL: paste ID from `?p=`, salt:iv from `#` fragment
2. Prompt for password → `GET /api/pastes/{ID}` → decrypt with AES-256-GCM
3. Display: if markdown, render via `marked.parse()` → `sanitizeHtml()` → `innerHTML`
4. Chat auto-initializes with 30-second polling

### Paste Deletion (Two Methods)

1. **Creator token**: `DELETE /api/pastes/{id}?token=...` — token hashed with SHA-256 + pepper
2. **Password-based**: `POST /api/pastes/{id}/delete` with `{deleteAuth}` — brute-force protected (10 failures / 5 min blocks paste ID). CASCADE deletes chat messages.

### Anonymous Chat

- Messages encrypted/decrypted with paste password + salt
- New format: JSON `{text, username}` (backward-compatible with old plain-text format)
- Server enforces 50-message FIFO limit, rate-limits per IP

### Anti-Spam

- **PoW**: SHA-256 puzzle (10-bit difficulty), **Rate Limiting**: 30 req/min per IP
- **Size Limits**: 8MB paste, 10KB message, **Brute-force**: 10 failures / 5 min blocks paste ID
- **Expiration**: Hourly cleanup

## Code Style & Conventions

### TypeScript
- Strict mode, 2-space indent, camelCase vars/functions, UpperCamelCase classes, kebab-case files
- Explicit types (no `any`), export for testing, JSDoc for public APIs

### Kotlin
- JetBrains defaults (4-space indent), data classes for DTOs, suspend for async, immutable preferred

### HTML
- Unique IDs across all HTML files (use page-specific prefixes)
- Semantic elements with ARIA attributes, all inputs need labels

### XSS / innerHTML Safety
- **NEVER** assign `innerHTML` directly from user content or markdown output
- **ALWAYS** use `sanitizeHtml()` from `client/src/core/utils/sanitize.ts` first

### File Organization
- Read `.ts` source files, not compiled `.js`
- Change docs go in `docs/prs/<description>/`
- Vendored libraries in `client/vendor/`, never CDN

## Testing Requirements

- **85% minimum overall coverage** for CI to pass
- **100% coverage** for security-critical code (crypto, security.ts, sanitize.ts, validators)
- **Coverage drops >5%** not acceptable without justification
- **Every PR must include tests** for all new code — no exceptions
- Tests must: have clear names, use Arrange-Act-Assert, cover all paths (happy, edge, error, security), be independent (no shared state), test behavior not implementation
- Run `make ci-check` before every PR

## Security Requirements (Non-Negotiable)

### Before Every Commit
- No hardcoded secrets, keys, or passwords in code
- No sensitive data in logs (keys, plaintext, tokens) — OK to log: request IDs, timestamps, paste IDs, status codes
- Client-side encryption verified (keys never sent to server)
- Input validation on server; error messages don't leak internals
- 100% test coverage for security-critical paths
- No XSS, SQL injection, or OWASP top 10; all `innerHTML` uses `sanitizeHtml()`

### Cryptographic Standards
- Web Crypto API only (no custom crypto)
- AES-256-GCM with `crypto.getRandomValues` for IV generation
- PBKDF2 with 100,000+ iterations, 16+ byte salt
- Keys derived independently (encryption vs delete auth)
- IVs never reused with same key

### Privacy Standards
- URL fragments for all key material
- No analytics, tracking, or external resources (CDNs, fonts)
- Server never sees plaintext or keys
- `sanitizeHtml()` before any `innerHTML` assignment

## API Contract & Backward Compatibility

**NEVER break existing API contracts.** When tests fail: investigate how the API is actually used in production, fix the test/consumer — don't change the API.

Before changing any public API: search all usages, check production code, verify return types, read design docs, consider if tests are wrong.

### Key Contracts

**`encryptWithPassword`** returns `ArrayBuffer`s, not strings. `EncryptionService` converts to base64url.

**`Result<T,E>`** — use `success()`, `failure()`, `isFailure()` from `core/models/result.ts`.

## API Endpoints

```
GET    /api/health              # Health check
GET    /api/pow                 # Get PoW challenge (204 if disabled)
POST   /api/pastes              # Create paste (requires PoW)
GET    /api/pastes/:id          # Retrieve paste
DELETE /api/pastes/:id          # Delete by token (creator only)
POST   /api/pastes/:id/delete   # Delete by password-derived auth
POST   /api/pastes/:id/messages # Post encrypted chat message
GET    /api/pastes/:id/messages # Get all encrypted chat messages
```

### Request/Response Formats

**POST /api/pastes** → `{ct, iv, meta: {expireTs, mime, allowChat}, pow: {challenge, nonce}, deleteAuth}` → **201** `{id, deleteToken}`

**POST /api/pastes/:id/delete** → `{deleteAuth}`

**POST /api/pastes/:id/messages** → `{ct, iv}` | **GET** → `{messages: [{ct, iv, timestamp}]}`

## Git Workflow & Commits

### Branches
- `main` — Production. **NEVER push directly.**
- Feature branches for PRs (any descriptive name). AI branches: `claude/<description>-<sessionId>`

### Commit Messages
Format: `<type>: <description>` — Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `perf`, `style`

Commit messages must align with branch purpose. All CI checks must pass (lint, typecheck, tests, 85% coverage).

## AI Collaboration Rules

### Pull Requests
- **Small PRs** (100-300 lines), one concern per PR, atomic and independently deployable
- **Logical, atomic commits** — each independently understandable
- **Use `gh` CLI** for all GitHub operations (not GitKraken)
- **No AI attribution** in PRs, commits, or docs
- **Push after each commit** to the feature branch

### PR Description Template
```
## Summary
[1-3 sentences: what and why]

## Changes
- [Bulleted list, grouped by area if multi-area]

## Test plan
- [ ] [Verification steps]
```

Never leave the description blank. Always include a test plan.

## Deployment

```bash
docker-compose up -d                                              # Dev (port 8080)
docker-compose -f docker-compose.prod.yml up -d                   # Prod (80/443)
docker-compose -f docker-compose.prod.yml -f docker-compose.secure.yml up -d  # HTTPS
make deploy-prod                                                  # VPS with SSL
make build-multiarch / make push-multiarch REGISTRY=... TAG=...   # Multi-arch
```

## Important Patterns & Decisions

- **Fragment-based key storage**: URL fragment (`#salt:iv`) never sent to server
- **Password key derivation**: PBKDF2 100k iterations, SHA-256, 16-byte salt — single password unlocks paste + chat
- **PoW**: Client-side SHA-256 puzzle, yields every 1000 iterations for UI responsiveness
- **Rate limiting**: Token bucket, 30/min per IP, separate buckets for pastes and messages
- **Delete token security**: SHA-256 + secret pepper before storage
- **Password-based deletion**: PBKDF2 with modified salt (`salt + ":delete"`), brute-force protected
- **Server-side key rotation** (`DataKeyManager`): AES-256-GCM keyring for deleteAuth hashes (defense-in-depth)
- **Delete token storage**: `sessionStorage` (expires with tab), legacy `localStorage` tokens migrated
- **Vendored libs**: `marked.js` + `highlight.js` in `client/vendor/` (no CDN)
- **Markdown safety**: `marked.parse()` → `sanitizeHtml()` → `innerHTML`
- **Paste lifecycle**: expires (hourly cleanup), creator token delete, or password delete — all cascade-delete chat

## Documentation

- **Setup**: `docs/getting-started/SETUP.md`
- **Deployment**: `docs/deployment/DEPLOYMENT.md`
- **Architecture**: `docs/architecture/C4-DIAGRAMS.md`
- **PoW**: `docs/architecture/PROOF_OF_WORK.md`
- **Testing**: `client/tests/README.md`
- **Security**: `docs/security/CHECKLIST.md`
- **Chat**: `docs/features/ANONYMOUS-CHAT.md`
- **Bazel**: `docs/development/BAZEL_QUICKSTART.md`
- Change docs go in `docs/prs/<description>/`
