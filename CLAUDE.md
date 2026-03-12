# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**Delirium** — zero-knowledge encrypted paste system. Server NEVER sees plaintext or keys. TypeScript frontend + Kotlin backend.

```
User Input → PBKDF2 → AES-256 Key → Encrypt → Upload (key stays in URL fragment!)
Share URL: domain.com/view?p=ID#salt:iv
```

- All encrypt/decrypt in browser via Web Crypto API (AES-256-GCM); keys derived via PBKDF2 (100k iterations)
- Keys in URL `#fragment` — browsers never send fragments to servers
- No accounts, tracking, or analytics

**Stack:** TS (strict, ES Modules), Web Crypto API, vendored marked.js + highlight.js (no CDN), Jest + Playwright, 85% min coverage | Kotlin + Ktor, SQLite + Exposed, Bazel, JDK 21+ | Docker + Nginx, multi-arch

---

## CRITICAL: Never Push to Main

**NEVER** push commits or tags to `main`/`master` directly. Always branch + PR.

```
❌ git push origin main / master / v1.x.x
✅ git checkout -b my-feature && git push -u origin my-feature && gh pr create
```

**Every change workflow:**
1. `git branch --show-current` — if on `main`, branch immediately
2. All changes (including version bumps) go on the feature branch
3. `gh pr create` — never merge directly
4. Tags only after PR merges to main

AI assistants MUST branch before any work, including trivial changes.

---

## High-Risk Change Protocol

Single mistakes in a zero-knowledge system permanently destroy trust. Apply this protocol to all changes in:

- **Privacy-critical**: crypto, key gen/derivation/storage, password handling, URL fragments, chat encryption, delete auth
- **Anonymity-critical**: logging, network requests, session management, error messages
- **Data integrity**: DB schema, backup/restore, expiration, single-view consumption

**Requirements:**
1. PR description must include: what's changing, what could leak, backward-compat plan, rollback plan
2. Document all relevant edge cases
3. 100% test coverage for changed security-critical code
4. Pass `docs/security/CHECKLIST.md` before submitting

**Always applies to:** `client/src/core/crypto/`, `client/src/security.ts`, `client/src/core/utils/sanitize.ts`, password/auth changes, key derivation, network requests, DB schema.
**May skip:** CSS/layout, docs, build scripts, non-security config. When in doubt, apply it.

---

## Commands

```bash
# Build & run
make quick-start              # First-time setup
make dev                      # Hot-reload dev
make dev-watch                # Docker watch (requires Compose 2.22+)
make build-client             # Compile TS
make start / stop / logs      # Docker services

# Test
make test                     # All client tests
cd client && npm run test:unit / test:integration / test:e2e / test:coverage / test:watch

# Server
make build-server-bazel / test-server-bazel

# Pre-PR
make ci-check                 # Full CI (run before every PR)
make ci-quick                 # Lint + typecheck + tests

# Other
cd client && npm run typecheck / lint / lint:fix
make clean
```

---

## Directory Structure

**Always read `.ts` source files in `client/src/`, never compiled `.js`.**

```
client/src/
  app.ts / delete.ts               # Entry points
  security.ts                      # encryptWithPassword, decryptWithPassword, deriveDeleteAuth, secureClear
  application/use-cases/           # create-paste, view-paste, delete-paste, chat
  core/
    crypto/                        # interfaces, aes-gcm, encoding
    services/                      # encryption-service, paste-service
    utils/sanitize.ts              # sanitizeHtml(), escapeText() — REQUIRED before innerHTML
    validators/index.ts            # validateContentSize, validateExpiration, validatePassword
  infrastructure/api/              # IApiClient, HttpApiClient, MockApiClient; PoW solver
  presentation/components/         # paste-creator-view, paste-viewer-view, chat-view, password-modal
  ui/                              # dom-helpers, ui-manager
  utils/                           # storage, passive-events

server/src/main/kotlin/
  App.kt / Routes.kt / Storage.kt / DataKeyManager.kt / Pow.kt / RateLimiter.kt / Models.kt / Utils.kt

client/vendor/     # marked.min.js, highlight.min.js (never CDN)
docs/              # security/CHECKLIST.md, architecture/C4-DIAGRAMS.md, etc.
```

---

## Critical Code Flows

**Create:** validate → `EncryptionService.encryptPaste()` (PBKDF2→AES-GCM) → `deriveDeleteAuth()` (salt+":delete") → PoW → `POST /api/pastes` → share URL `?p=ID#salt:iv` → store delete token in `sessionStorage`

**View:** parse `?p=` + `#salt:iv` → password prompt → `GET /api/pastes/{id}` → decrypt → `marked.parse()` → `sanitizeHtml()` → `innerHTML` → start 30s chat poll

**Delete:** token → `DELETE /api/pastes/{id}?token=` | password → `POST /api/pastes/{id}/delete` with `{deleteAuth}` (brute-force: 10 fails/5min blocks)

**Chat:** encrypt/decrypt with paste password+salt; JSON `{text,username}`; 50-msg FIFO; rate-limited per IP

**Anti-spam:** SHA-256 PoW (10-bit), 30 req/min rate limit, 8MB paste / 10KB message limits, hourly expiry cleanup

---

## Code Style

**TypeScript:** strict, 2-space indent, camelCase vars/fns, UpperCamelCase classes, kebab-case files, explicit types (no `any`), JSDoc for public APIs

**Kotlin:** 4-space indent, data classes for DTOs, suspend for async, prefer immutable

**HTML:** unique IDs per page (use page prefix), semantic elements, ARIA attributes, all inputs labelled

**XSS safety:** NEVER assign `innerHTML` without `sanitizeHtml()` first. Use `escapeText()` for plain text interpolated into HTML strings.

**Files:** `.ts` sources only; change docs in `docs/prs/<description>/`; vendored libs in `client/vendor/`

---

## Testing

- **85% overall minimum** (CI enforced); **100% for security-critical** (crypto, security.ts, sanitize.ts, validators)
- **Every new or changed code path must have tests — no exceptions.** Write tests in the same commit as the code, not as a follow-up.
- Coverage drops >5% require justification; every PR must add tests for new code
- Tests: clear names, Arrange-Act-Assert, cover happy/edge/error/security paths, independent (no shared state), test behavior not implementation
- Run `make ci-check` before every PR

**What always needs tests:** new Kotlin classes/functions, new routes, new TypeScript modules, changed business logic, changed security logic, new utility functions.

**What doesn't need unit tests:** Makefile targets, YAML/JSON config files, documentation, `.env` templates, nginx config (no unit test framework available).

---

## Security (Non-Negotiable)

**Every commit:** no hardcoded secrets; no sensitive data in logs (OK: request IDs, timestamps, paste IDs, status codes); keys never sent to server; server-side input validation; error messages don't leak internals; 100% coverage on security paths; no OWASP top 10 issues; `sanitizeHtml()` on all `innerHTML`

**Crypto:** Web Crypto API only (no custom crypto); AES-256-GCM + `crypto.getRandomValues` for IVs; PBKDF2 100k+ iterations, 16+ byte salt; independent key derivation for encryption vs delete auth; IVs never reused

**Privacy:** URL fragments for all key material; no CDNs, analytics, or external resources; server never sees plaintext or keys

---

## API Contract

**NEVER break existing API contracts.** When tests fail, investigate production usage and fix the consumer — don't change the API.

```
GET    /api/health
GET    /api/pow                          # 204 if disabled
POST   /api/pastes                       # {ct,iv,meta:{expireTs,mime,allowChat},pow,deleteAuth} → 201 {id,deleteToken}
GET    /api/pastes/:id                   # → {ct,iv,meta}
DELETE /api/pastes/:id?token=            # creator token delete
POST   /api/pastes/:id/delete            # {deleteAuth} — password-based delete
POST   /api/pastes/:id/messages          # {ct,iv}
GET    /api/pastes/:id/messages          # → {messages:[{ct,iv,timestamp}]}
```

**Key contracts:** `encryptWithPassword` returns `ArrayBuffer`s (not strings); use `Result<T,E>` with `success()`, `failure()`, `isFailure()` from `core/models/result.ts`

---

## Version Bumping

Always: `make version-bump VERSION=x.y.z` — never edit version strings manually.

Updates: `client/package.json`, `MODULE.bazel`, HTML files, `client/tests/e2e/delete-paste.spec.ts`, `server/docs/API.md`

Then manually update image tags in `docker-compose.yml`, `docker-compose.prod.yml`, `k8s/server/deployment.yaml`, and regenerate lock: `npm --prefix client install --package-lock-only`

Out-of-sync HTML: `./scripts/bump-version.sh x.y.z --force`

Verify `version-display` anchors in `index.html`, `view.html`, `delete.html` after any bump.

---

## Git & Commits

- `main` — production, never push directly. AI branches: `claude/<description>-<sessionId>`
- Commit format: `<type>: <description>` — types: `feat fix docs test refactor chore perf style`
- All CI checks must pass before merging (lint, typecheck, tests, 85% coverage)

---

## Dependency Management

**NEVER** run `npm install --legacy-peer-deps` or `--force` without diagnosing the conflict first.

**Process:**
1. Run plain `npm install` and read the full error
2. Diagnose: `npm explain <package>` or `npm ls <package>`
3. Fix root cause: update the dep, add `overrides` in `package.json`, or pin with `--save-exact`
4. `--legacy-peer-deps` only as documented last resort with PR explanation

Before adding any dependency: `npm info <package> deprecated` — never add a deprecated package.

Prefer `"overrides": { "pkg": "^x.y.z" }` in `package.json` over suppression flags.

---

## AI Collaboration

**Command approvals:** When a tool call is approved, persist it to `allowedTools` in `.claude/settings.json` (project) or `~/.claude/settings.json` (global). Use glob patterns: `"Bash(git *)"`, `"Bash(make *)"`.

**Tests first:** Write tests for every new class, function, or route in the same commit as the implementation. Never defer tests to a follow-up PR.

**PRs:** small (100–300 lines), one concern, atomic commits, `gh` CLI only, no AI attribution, push after each commit

**PR description template:**
```
## Summary
[1–3 sentences: what and why]

## Changes
- [Grouped bullets by area]

## Test plan
- [ ] [Steps]
```

---

## Deployment

```bash
docker-compose up -d                                                              # Dev (8080)
docker-compose -f docker-compose.prod.yml up -d                                   # Prod (80/443)
docker-compose -f docker-compose.prod.yml -f docker-compose.secure.yml up -d      # HTTPS
make deploy-prod                                                                   # VPS + SSL
make build-multiarch / push-multiarch REGISTRY=... TAG=...
```

---

## Key Design Decisions

- Fragment-based keys (`#salt:iv`) never reach the server
- Single password unlocks paste + chat (PBKDF2 100k, SHA-256, 16-byte salt)
- PoW: client-side SHA-256, yields every 1000 iterations for UI responsiveness
- Rate limiting: token bucket 30/min per IP, separate buckets for pastes/messages
- Delete tokens: SHA-256 + pepper; password deletion uses `salt+":delete"` PBKDF2 variant
- `DataKeyManager`: AES-256-GCM keyring rotates deleteAuth hashes (defense-in-depth)
- Delete tokens in `sessionStorage` (tab-scoped); legacy `localStorage` tokens auto-migrated
- Paste lifecycle: expiry (hourly) | creator token delete | password delete — all cascade to chat

## Docs

`docs/getting-started/SETUP.md` · `docs/deployment/DEPLOYMENT.md` · `docs/architecture/C4-DIAGRAMS.md` · `docs/architecture/PROOF_OF_WORK.md` · `client/tests/README.md` · `docs/security/CHECKLIST.md` · `docs/features/ANONYMOUS-CHAT.md` · `docs/development/BAZEL_QUICKSTART.md` · Change docs → `docs/prs/<description>/`
