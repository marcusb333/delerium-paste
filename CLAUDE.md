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

**Security Flow:**
```
User Input → PBKDF2 → AES-256 Key → Encrypt → Upload (without key!)
Share URL: domain.com/view?p=ID#salt:iv  (key stays client-side)
```

## Technology Stack

**Frontend (client/):**
- TypeScript with strict mode, ES Modules
- Web Crypto API for encryption
- Vendored `marked.js` (Markdown rendering) and `highlight.js` (syntax highlighting) — no CDN dependencies
- Jest (unit/integration), Playwright (e2e)
- ESLint, 85% minimum code coverage

**Backend (server/):**
- Kotlin + Ktor framework
- SQLite database with Exposed SQL library
- Bazel build system
- JDK 21+ (container uses Eclipse Temurin 25 JRE)

**Infrastructure:**
- Docker + Docker Compose
- Nginx reverse proxy
- Multi-architecture support (AMD64, ARM64, ARM/v7)

---

## CRITICAL: Never Push Directly to Main

> **This is the single most important rule for AI assistants working in this repo.**

**NEVER push to `main` or `master` — not commits, not tags, not anything.** Always work on a feature branch and open a Pull Request.

```
❌ BAD:  git push origin main
❌ BAD:  git push origin master
❌ BAD:  git push origin v1.x.x          ← tags must ONLY be pushed after PR is merged
✅ GOOD: git checkout -b draft/my-feature
✅ GOOD: git push -u origin draft/my-feature
✅ GOOD: gh pr create ...
✅ GOOD: git tag vX.Y.Z && git push origin vX.Y.Z   ← ONLY after PR is merged to main
```

**Mandatory workflow for every change:**
1. Check current branch: `git branch --show-current`
2. **If on `main` or `master`, create a feature branch IMMEDIATELY before touching any file:** `git checkout -b draft/<description>`
3. Make ALL changes on the feature branch (including version bumps, CLAUDE.md edits, config changes)
4. Push only to the feature branch
5. Open a PR via `gh pr create` — never merge directly
6. After PR is merged: create and push the git tag, then push to Docker Hub, then create GitHub release

> **AI assistants MUST create a branch before any implementation work — including trivial one-line changes.**

**Tags must never be pushed before the corresponding commit lands in main via a merged PR.**
This protects the production branch and ensures all changes are reviewed.

---

## High-Risk Change Protocol (CRITICAL)

### Core Principle: Privacy is Non-Negotiable

**Anonymity, privacy, and quality are paramount.** In a zero-knowledge system, a single mistake can permanently destroy user trust. When making significant changes to privacy-critical systems, extraordinary care is required.

### What Constitutes a High-Risk Change

Changes to these areas require the full High-Risk Change Protocol:

**Privacy-Critical Systems:**
- Encryption/decryption algorithms or implementations
- Key generation, storage, or derivation (PBKDF2, salt generation)
- Password handling or authentication flows
- Data transmission (what gets sent to server)
- URL fragment handling (key storage)
- Chat message encryption/decryption
- Delete authorization mechanisms

**Anonymity-Critical Systems:**
- Logging that could leak user data
- Network requests that could reveal information
- Session management
- IP tracking or rate limiting
- Error messages that could expose internal state

**Data Integrity Systems:**
- Database schema changes affecting paste/message storage
- Backup/restore functionality
- Data cleanup/expiration logic
- Single-view consumption logic

### Mandatory Requirements for High-Risk Changes

When touching privacy-critical code, you MUST:

#### 1. Risk Assessment (Before Coding)
```markdown
Document in PR description:
- [ ] What system is being changed and why
- [ ] What could go wrong (threat model)
- [ ] What data could leak if implementation is flawed
- [ ] How existing users are protected (backward compatibility)
- [ ] Rollback plan if issues are discovered
```

#### 2. Edge Case Identification
Identify and document ALL edge cases:

**Encryption/Decryption:**
- Empty strings, single character, maximum size
- Unicode (emoji, RTL text, zero-width characters)
- Binary data, null bytes, special characters
- Corrupted ciphertext, wrong IV length
- Key derivation with weak/empty passwords
- Malformed salt or IV values

**Authentication/Authorization:**
- Password retry limits and memory clearing
- Delete auth collision scenarios
- Token generation entropy
- Timing attacks on password/token comparison

**Data Handling:**
- Maximum payload sizes
- Concurrent access/race conditions
- Database transaction failures
- Paste expiration edge cases (exactly at expiration time)
- Single-view with multiple simultaneous requests

**Network/Privacy:**
- Network failures during encryption
- Server errors after client-side encryption
- Key accidentally sent in request body/headers
- Browser back/forward with cached keys
- URL fragment handling across browsers
- Request interception (service workers, proxies)
- DNS rebinding attacks
- CORS and preflight request handling

**Browser Compatibility:**
- Web Crypto API availability in different browsers
- Safari private mode restrictions (localStorage, IndexedDB)
- Mobile browser limitations (memory, crypto performance)
- Older browser versions lacking Web Crypto API
- Browser extensions interfering with crypto operations
- Incognito/private browsing mode differences

**State Management:**
- Browser refresh during encryption/upload
- Tab close during ongoing operations
- Multiple tabs viewing same paste simultaneously
- Session vs localStorage vs memory-only storage
- Window.unload and beforeunload handling
- Memory leaks from event listeners

**Time-Based:**
- Timezone differences for expiration calculations
- Daylight saving time transitions
- Server/client clock skew (future/past timestamps)
- Paste expiring during view attempt
- Expiration at exactly midnight UTC
- Leap seconds and year boundaries

**Proof-of-Work:**
- PoW solving interrupted (tab close, refresh)
- Challenge expiration/reuse attempts
- Multiple concurrent PoW attempts from same IP
- PoW difficulty changes mid-solve
- Invalid nonce acceptance

**Chat-Specific:**
- Message ordering with concurrent posts from multiple users
- 50-message limit boundary (message 50, 51 behavior)
- Message deletion cascading when paste deleted
- Rapid message posting hitting rate limits
- Chat encryption key mismatch with paste key
- Message timestamps in different timezones
- Username truncation (max 20 chars)
- Backward-compatible JSON format vs old plain-text format

**URL/Fragment:**
- URL encoding of salt/IV (special characters)
- Fragment preservation through redirects
- Bookmarking with vs without fragment
- URL shorteners and fragment handling
- Paste ID collision probability
- QR code generation with fragments
- Email clients stripping fragments

#### 3. Test Coverage Requirements

High-risk changes require **100% test coverage** for:

**Security paths:**
```typescript
// ✅ REQUIRED: Test that keys never leave client
it('should never send encryption key to server', async () => {
  const fetchSpy = jest.spyOn(global, 'fetch');
  await createPaste('test', 'password');

  // Assert: No request contains key material
  const requestBodies = fetchSpy.mock.calls.map(call => call[1]?.body);
  requestBodies.forEach(body => {
    expect(body).not.toContain('key');
    expect(body).not.toContain('password');
  });
});

// ✅ REQUIRED: Test that fragments stay client-side
it('should store keys only in URL fragments', () => {
  const url = buildShareUrl(pasteId, salt, iv);
  expect(url).toMatch(/#/); // Has fragment
  expect(url.split('#')[0]).not.toContain(salt); // Key not in path
});
```

**Edge cases:**
```typescript
// ✅ REQUIRED: Unicode edge cases
it('should encrypt/decrypt emoji correctly', async () => {
  const emoji = '🔐💾🎉';
  const result = await roundtrip(emoji, 'password');
  expect(result).toBe(emoji);
});

// ✅ REQUIRED: Boundary conditions
it('should handle maximum paste size', async () => {
  const maxContent = 'a'.repeat(MAX_PASTE_SIZE);
  const result = await createPaste(maxContent, 'pass');
  expect(result.success).toBe(true);
});

// ✅ REQUIRED: Concurrent access
it('should handle simultaneous single-view requests safely', async () => {
  const results = await Promise.all([
    viewPaste(id),
    viewPaste(id),
    viewPaste(id)
  ]);
  // Only one should succeed, others should fail gracefully
  const successes = results.filter(r => r.success).length;
  expect(successes).toBe(1);
});
```

**Failure modes:**
```typescript
// ✅ REQUIRED: Graceful degradation
it('should clear sensitive data on decryption failure', async () => {
  try {
    await decryptWithPassword(ct, 'wrong-password', salt, iv);
  } catch {
    // Assert: Password not in memory
    expect(heap).not.toContain('wrong-password');
  }
});
```

#### 4. Security Review Checklist

Before submitting high-risk PR:

**Code Review:**
- [ ] No hardcoded secrets, keys, or passwords
- [ ] No logging of plaintext, keys, or tokens
- [ ] All sensitive data cleared from memory after use
- [ ] Constant-time comparison for secrets (prevent timing attacks)
- [ ] Input validation on all user-provided data
- [ ] Error messages don't leak internal details
- [ ] No data sent to server that should stay client-side

**Cryptographic Review:**
- [ ] Using Web Crypto API (not custom crypto)
- [ ] AES-256-GCM with proper IV generation (crypto.getRandomValues)
- [ ] PBKDF2 with 100,000+ iterations
- [ ] Salt generated with crypto.getRandomValues (16+ bytes)
- [ ] Keys derived independently (encryption vs delete auth)
- [ ] IVs never reused with same key

**Privacy Review:**
- [ ] URL fragments used for all key material
- [ ] No analytics or tracking code
- [ ] No external resources loaded (CDNs, fonts, etc.) — use vendored libs in `client/vendor/`
- [ ] Server never sees plaintext or keys
- [ ] Network requests reviewed for information leakage
- [ ] Browser history/cache can't leak sensitive data
- [ ] `sanitizeHtml()` used before any `innerHTML` assignment

**Testing Review:**
- [ ] 100% coverage for all changed security-critical code
- [ ] All edge cases identified and tested
- [ ] All failure modes tested
- [ ] Integration tests for full flows
- [ ] E2E tests for user-facing changes
- [ ] Load tests for concurrent access scenarios

#### 5. Deployment Safety

For high-risk changes:

**Pre-Deployment:**
- [ ] Manual testing in local environment
- [ ] Test with multiple browsers (Chrome, Firefox, Safari)
- [ ] Test on mobile devices
- [ ] Verify backward compatibility with existing pastes
- [ ] Database migration plan (if applicable)

**Deployment Strategy:**
- [ ] Feature flag for gradual rollout (if applicable)
- [ ] Monitoring for error rates
- [ ] Rollback plan documented and tested
- [ ] Backup of production data before deployment

**Post-Deployment:**
- [ ] Monitor error logs for new issues
- [ ] Verify old pastes still decrypt correctly
- [ ] Check chat messages still function
- [ ] Validate delete functionality (both methods)

### Examples of High-Risk Changes Done Right

**✅ GOOD: Adding Password Retry Feature**
```
PR includes:
- Feature implementation (password retry logic)
- Edge case tests (5 attempts, memory clearing)
- Security tests (password not logged, cleared after use)
- Integration tests (works with single-view)
- E2E tests (user flow with retries)
- Documentation of behavior
- 100% coverage for new code
Result: 82.69% → 85.30% coverage ✅
```

**❌ BAD: Adding Password Retry Feature**
```
PR includes:
- Feature implementation only
- Comment: "will add tests later"
- Coverage drops: 82.69% → 75% (-7%)
- No edge case analysis
- No security review
Result: ❌ REJECTED - violates protocol
```

### When to Apply This Protocol

**ALWAYS apply full protocol for:**
- Any changes to `client/src/core/crypto/`
- Any changes to `client/src/security.ts`
- Any changes to `client/src/core/utils/sanitize.ts`
- Password or authentication changes
- Key generation or derivation changes
- Network request modifications
- Delete authorization changes
- Database schema changes

**MAY skip protocol for:**
- UI-only changes (CSS, layout) with no logic
- Documentation updates
- Build script changes
- Non-security configuration changes

**When in doubt, apply the protocol.** Better to be overly cautious with privacy than to make a mistake.

### Remember

1. **One mistake can destroy all user trust** - there are no do-overs with privacy
2. **Test edge cases exhaustively** - users will find them
3. **Document threat model** - explain what could go wrong
4. **100% coverage for security code** - no exceptions
5. **Review twice, deploy once** - get it right the first time

See also:
- `docs/security/CHECKLIST.md` - Security audit checklist
- `.cursor/rules/workspace.md` - API contract rules
- `client/tests/README.md` - Testing standards

## Common Development Commands

### Building & Running
```bash
# First time setup
make quick-start              # Interactive setup with secrets config

# Development mode (hot-reload)
make dev                      # Backend in Docker, frontend watches for changes

# Standard workflow
make build-client             # Compile TypeScript
make start                    # Build client + start Docker services
make stop                     # Stop all containers
make logs                     # Follow container logs

# Testing
make test                     # Run all client tests
cd client && npm run test:unit           # Unit tests only
cd client && npm run test:integration    # Integration tests only
cd client && npm run test:e2e            # Playwright e2e tests
cd client && npm run test:e2e:ui         # Playwright UI mode (interactive debugging)
cd client && npm run test:coverage       # With coverage report
cd client && npm run test:watch          # Watch mode for TDD workflow
cd client && npm run test:load           # Load tests (normally skipped)
cd client && npm run test:all            # Run all test types sequentially

# Server (Bazel)
make build-server-bazel       # Build server with Bazel
make test-server-bazel        # Run server tests
bazel test //server:all_tests # Direct Bazel command
```

### Pre-PR Verification (CRITICAL)
```bash
# Run ALL checks before creating/pushing to PR
make ci-check                 # Full CI verification (parallel)
make ci-quick                 # Quick checks (lint, type, tests)

# Or use script directly
./scripts/ci-verify-all.sh    # Comprehensive CI verification
```

### Development Tips
```bash
# Type checking (no compilation)
cd client && npm run typecheck

# Linting
cd client && npm run lint            # Check for issues
cd client && npm run lint:fix        # Auto-fix issues

# Clean everything
make clean                    # Remove containers, volumes, build artifacts
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
│   │
│   ├── application/                 # Application layer — use cases and DTOs
│   │   ├── dtos/
│   │   │   └── paste-dtos.ts        # CreatePasteCommand, PasteCreated, ViewPasteResult, etc.
│   │   └── use-cases/
│   │       ├── create-paste-use-case.ts  # Orchestrates: validate → encrypt → PoW → submit → URL
│   │       ├── view-paste-use-case.ts    # Orchestrates: fetch → decrypt → display
│   │       ├── delete-paste-use-case.ts  # Token-based and password-based deletion
│   │       └── chat-use-case.ts          # Send/receive encrypted chat messages
│   │
│   ├── core/                        # Domain layer (framework-agnostic)
│   │   ├── crypto/
│   │   │   ├── interfaces.ts        # ICryptoProvider interface
│   │   │   ├── aes-gcm.ts           # Low-level AES-GCM implementation
│   │   │   └── encoding.ts          # Base64URL encode/decode utilities
│   │   ├── models/
│   │   │   ├── result.ts            # Result<T,E> type: success() / failure() / isFailure()
│   │   │   └── paste.ts             # Paste domain types, CreatePasteRequest, GetPasteResponse
│   │   ├── services/
│   │   │   ├── encryption-service.ts # EncryptionService: encryptPaste, decryptPaste,
│   │   │   │                         #   encryptChatMessage, decryptChatMessage, deriveDeleteAuth
│   │   │   └── paste-service.ts      # PasteService: validate, buildShareUrl, buildDeleteUrl,
│   │   │                             #   parseViewUrl, calculateExpirationTimestamp
│   │   ├── utils/
│   │   │   └── sanitize.ts          # sanitizeHtml() — DOM-walker sanitizer for markdown output.
│   │   │                            #   REQUIRED before any innerHTML assignment.
│   │   └── validators/
│   │       └── index.ts             # validateContentSize, validateExpiration, validatePassword
│   │
│   ├── features/                    # Legacy feature orchestration (thin wrappers)
│   │   ├── paste-creator.ts         # Wires up CreatePasteUseCase + PasteCreatorView
│   │   ├── paste-viewer.ts          # Wires up ViewPasteUseCase + PasteViewerView
│   │   └── paste-chat.ts            # Wires up ChatUseCase + ChatView
│   │
│   ├── infrastructure/              # External integrations
│   │   ├── api/
│   │   │   ├── interfaces.ts        # IApiClient interface
│   │   │   ├── http-client.ts       # Fetch-based HTTP API client
│   │   │   └── mock-client.ts       # In-memory mock for tests
│   │   └── pow/
│   │       ├── interfaces.ts        # IPowSolver interface
│   │       └── inline-solver.ts     # SHA-256 PoW solver (yields every 1000 iterations)
│   │
│   ├── presentation/                # Presentation layer — UI components
│   │   └── components/
│   │       ├── paste-creator-view.ts  # Markdown editor tabs, toolbar, form submit handler
│   │       ├── paste-viewer-view.ts   # Paste display, destroy button, syntax highlighting
│   │       ├── chat-view.ts           # Chat display, message sending, 30s auto-poll
│   │       ├── password-modal.ts      # Reusable password prompt modal
│   │       └── loading-indicator.ts   # Loading state management
│   │
│   ├── ui/
│   │   ├── dom-helpers.ts           # Low-level DOM utilities
│   │   └── ui-manager.ts            # showLoading(), showError(), showSuccess()
│   │
│   ├── utils/
│   │   ├── storage.ts               # sessionStorage helpers, delete token persistence
│   │   └── passive-events.ts        # Passive event listener registration
│   │
│   └── types/
│       └── vendor.d.ts              # Type declarations for vendored libs (marked, hljs)
│
├── vendor/
│   ├── marked.min.js                # Markdown parser (vendored, no CDN)
│   └── highlight.min.js             # Syntax highlighter (vendored, no CDN)
│
├── styles/
│   ├── design-system.css            # CSS custom properties, tokens
│   ├── components.css               # Reusable component styles
│   ├── pages.css                    # Page-specific layouts
│   ├── chat.css                     # Chat UI styles
│   ├── modals.css                   # Modal/overlay styles
│   ├── loading.css                  # Loading indicator styles
│   ├── mobile.css                   # Responsive/mobile overrides
│   └── highlight-dark.min.css       # Syntax highlighting theme (vendored)
│
├── index.html                       # Paste creation page
├── view.html                        # Paste viewing page
├── delete.html                      # Paste deletion page (token-based)
├── tests/
│   ├── unit/                        # Fast, isolated tests (*.test.ts)
│   │   ├── core/crypto/             # aes-gcm.test.ts, encoding.test.ts
│   │   ├── core/models.test.ts
│   │   ├── core/validators.test.ts
│   │   ├── core/utils/sanitize.test.ts
│   │   ├── features/                # paste-creator.test.ts, paste-viewer.test.ts, paste-chat.test.ts
│   │   ├── infrastructure/          # api-client.test.ts, pow-solver.test.ts
│   │   ├── presentation/            # chat-view.test.ts, paste-creator-view.test.ts
│   │   ├── ui/                      # dom.test.ts, loading-states.test.ts
│   │   ├── utils/storage.test.ts
│   │   ├── security.test.ts
│   │   └── high-risk-edge-cases.test.ts
│   ├── integration/
│   │   └── chat-api.test.ts
│   ├── load/
│   │   └── pow-load.test.ts
│   ├── e2e/                         # Playwright tests (*.spec.ts)
│   │   ├── paste-flow.spec.ts
│   │   ├── delete-paste.spec.ts
│   │   ├── view-paste-destroy.spec.ts
│   │   ├── footer-links.spec.ts
│   │   └── ui-snapshots.spec.ts
│   └── setup.ts                     # Jest test environment setup
└── package.json
```

### Server Architecture
```
server/
├── src/main/kotlin/
│   ├── App.kt               # Application setup, DI, config loading
│   ├── Routes.kt            # All API endpoints — see API Endpoints section
│   ├── Storage.kt           # SQLite schema, PasteRepo, chat message repo
│   ├── DataKeyManager.kt    # Server-side AES-256-GCM key rotation for metadata fields
│   │                        #   (deleteAuth hashes). Manages keyring, rotates on schedule.
│   ├── Pow.kt               # Proof-of-work challenge generation and verification
│   ├── RateLimiter.kt       # Token bucket rate limiter (per-IP)
│   ├── Models.kt            # Request/response DTOs (CreatePasteRequest, etc.)
│   └── Utils.kt             # Ids.randomId(), base64UrlSize()
├── BUILD.bazel              # Bazel build configuration
├── Dockerfile               # Multi-stage Docker build (Eclipse Temurin 25 JRE)
└── src/test/kotlin/         # Kotlin tests
```

### Important Files to Read
- `README.md` - Project documentation index
- `.cursor/rules/workspace.md` - Comprehensive workspace rules (security, testing, API contracts)
- `docs/architecture/C4-DIAGRAMS.md` - Architecture diagrams (System, Container, Component levels)
- `docs/security/CHECKLIST.md` - Security audit checklist
- `client/tests/README.md` - Testing standards
- `Makefile` - All available commands

## Critical Code Flows

### Paste Creation Flow

Implemented in `CreatePasteUseCase.execute()`:

1. User enters content + settings (expiration, password) in `index.html`
2. `PasteCreatorView.handleSubmit()` triggers use case
3. `PasteService.validatePasteCreation()` validates size, expiration, password, UTF-8
4. `EncryptionService.encryptPaste()` calls `encryptWithPassword()` → PBKDF2 → AES-256-GCM
5. `EncryptionService.deriveDeleteAuth()` derives delete auth (separate PBKDF2 with `salt + ":delete"`)
6. `IApiClient.getPowChallenge()` → `GET /api/pow`
7. `IPowSolver.solve()` finds SHA-256 nonce with required leading zero bits
8. `IApiClient.createPaste()` → `POST /api/pastes` with `{ct, iv, meta: {expireTs, mime, allowChat}, pow, deleteAuth}`
9. Server verifies PoW, rate-limits, validates sizes, stores in SQLite, returns `{id, deleteToken}`
10. `PasteService.buildShareUrl()` → `domain.com/view.html?p=ID#salt:iv` (key only in fragment!)
11. `PasteService.buildDeleteUrl()` → `domain.com/delete.html?p=ID&token=...`
12. Delete token stored in `sessionStorage` (not `localStorage`) via `storeDeleteToken()`

### Paste Viewing Flow

Implemented in `ViewPasteUseCase`:

1. User opens URL: paste ID in query string (`?p=`), salt:iv in URL fragment (`#`)
2. `PasteService.parseViewUrl()` extracts `pasteId`, `salt`, `iv` from URL
3. `PasswordModal` prompts for password
4. `IApiClient.retrievePaste()` → `GET /api/pastes/{ID}`
5. Server returns `{ct, iv, meta}` (always encrypted, never plaintext)
6. `EncryptionService.decryptPaste()` derives key from password + salt, decrypts with AES-256-GCM
7. `PasteViewerView` displays content — if markdown, renders via `marked.parse()` → `sanitizeHtml()` → `innerHTML`
8. Syntax highlighting applied to code blocks via `hljs.highlightElement()`
9. "Destroy Paste" button available (password-based deletion)
10. Chat section auto-initializes with 30-second polling

### Paste Deletion Flow

**Two methods:**

1. **Creator-only (delete token) — `delete.html`:**
   - Creator receives delete URL at creation time: `delete.html?p=ID&token=...`
   - `DELETE /api/pastes/{id}?token=...`
   - Token is random, stored hashed (SHA-256 + pepper) server-side
   - Returns 204 on success, 403 on invalid token

2. **Anyone with password — "Destroy Paste" button:**
   - Client derives `deleteAuth` from `password + salt + ":delete"` via PBKDF2
   - `POST /api/pastes/{id}/delete` with `{deleteAuth}`
   - Server compares hashed deleteAuth; brute-force protection via `FailedAttemptTracker`
     (10 failures within 5 minutes blocks the paste ID)
   - Returns 204 on success, 403 on mismatch, 429 on too many attempts
   - CASCADE deletes all chat messages

### Anonymous Chat Flow

1. Chat auto-initializes on paste view page with 30-second polling
2. Messages fetched: `GET /api/pastes/{ID}/messages`
3. Server returns list of `{ct, iv, timestamp}` (always encrypted)
4. `EncryptionService.decryptChatMessage()` decrypts each message with paste key
   - New format: JSON payload `{text, username}` (username truncated to 20 chars)
   - Old format: plain text string (backward compatible)
5. User types message + optional username, clicks "Send"
6. `EncryptionService.encryptChatMessage()` encrypts JSON payload with paste key
7. `POST /api/pastes/{ID}/messages` with `{ct, iv}`
8. Server enforces 50-message FIFO limit, rate-limits per IP

**Note**: Chat uses the same password and salt as the paste. Messages cascade-delete with paste.

### Anti-Spam Mechanisms
- **Proof-of-Work**: SHA-256 puzzle (10-bit difficulty ≈ 1024 attempts, <1 second)
- **Rate Limiting**: Token bucket (30 req/min per IP); separate bucket for messages
- **Size Limits**: 8MB max paste size (supports encrypted image pastes), 10KB per chat message
- **Brute-force Protection**: `FailedAttemptTracker` blocks paste ID after 10 failed delete attempts in 5 min
- **Expiration**: Hourly cleanup of expired pastes

## Code Style & Conventions

### TypeScript
- Strict mode enabled
- 2-space indentation
- camelCase for variables/functions, UpperCamelCase for classes
- kebab-case for filenames
- Explicit types preferred over `any`
- Export main functions/classes for testing
- JSDoc comments for public APIs

### Kotlin
- JetBrains defaults (4-space indent)
- UpperCamelCase for classes
- Data classes for DTOs
- Suspend functions for async operations
- Immutable properties preferred

### HTML
- **Unique IDs across all HTML files**: Element IDs must be unique across `index.html`, `view.html`, `delete.html`, etc. to avoid browser autofill warnings
- Use page-specific prefixes for IDs serving similar purposes: e.g., `copyBtn` (index) vs `copyContentBtn` (view)
- Semantic HTML elements with proper ARIA attributes
- All form inputs must have associated labels

### XSS / innerHTML Safety
- **NEVER** assign `innerHTML` directly from user content or markdown output
- **ALWAYS** pass through `sanitizeHtml()` from `client/src/core/utils/sanitize.ts` first
- `sanitizeHtml()` removes: `script`, `iframe`, `object`, `embed`, `form`, `input`, `button`, `link`, `meta`, `base`, `style` tags; all `on*` event handlers; `javascript:` hrefs; external `<img>` src (tracking pixel protection)

### File Organization Rules
- **Source code**: Read `.ts` files in `client/src/`, NOT compiled `.js` files in `client/js/`
- **Change documentation**: Place in `docs/prs/<description>/` folders, NOT repository root
- **Tests**: Must accompany all new code in the same PR
- **Vendored libraries**: Place in `client/vendor/`, never load from CDN

## Testing Requirements (CRITICAL)

### Coverage Standards
- **Minimum 85% overall coverage** for CI to pass
- **100% coverage required** for security-critical code:
  - Encryption/decryption (`client/src/core/crypto/`, `client/src/security.ts`)
  - Password handling
  - Authentication
  - Input validation
  - Security utilities (`client/src/core/utils/sanitize.ts`)
- **Coverage drops >5%**: NOT acceptable without justification

### Zero Untested Code Policy
**EVERY PR must include tests for ALL new code.** No exceptions.

- Adding a new function? Add tests for it
- Adding a new feature? Add tests for it
- Fixing a bug? Add a test that would have caught it
- Modifying logic? Update/add tests

### Test Quality
Tests must have:
- Clear descriptive names: `it('should allow 5 password attempts before failing')`
- Arrange-Act-Assert structure with comments explaining WHY
- Test all paths: happy path, edge cases, errors, security scenarios
- Independent tests (no shared state between tests)
- Test behavior, not implementation details

### Pre-PR Testing Checklist
Before every PR:
```bash
# 1. Clean build
cd client
rm -rf node_modules coverage dist
npm install

# 2. Build
npm run build

# 3. Lint
npm run lint  # Must pass with 0 errors, 0 warnings

# 4. Type check
npm run typecheck  # Must compile with no errors

# 5. Run tests
npm test  # All tests must pass

# 6. Check coverage
npm run test:coverage  # Verify ≥85% or drop ≤5%
```

Or use: `make ci-check` to run all checks automatically.

## API Contract & Backward Compatibility (CRITICAL)

### Rule: NEVER Break Existing API Contracts

When tests fail or integrations break:
1. **DO NOT** change the API signature to match test expectations
2. **DO** investigate how the API is actually used in production code
3. **DO** fix the test/consumer to match the actual API contract
4. **DO** understand WHY the API was designed that way

### Before Changing Any Public API
- [ ] Search codebase for all usages
- [ ] Check how it's called in production code
- [ ] Verify return types/parameters in real usage
- [ ] Read comments/docs explaining design decisions
- [ ] Consider if tests are wrong, not the API

### API Contracts in This Codebase

**`encryptWithPassword` returns `ArrayBuffer`s, not strings:**
```typescript
export async function encryptWithPassword(
  content: string,
  password: string
): Promise<{ encryptedData: ArrayBuffer; salt: ArrayBuffer; iv: ArrayBuffer }>
```
The `EncryptionService` converts to base64url after calling this. Tests must work with `ArrayBuffer`.

**`Result<T,E>` pattern** — use `success()`, `failure()`, `isFailure()` from `core/models/result.ts`:
```typescript
if (isFailure(result)) { return failure(result.error.join('. ')); }
```

## Security Requirements (Non-Negotiable)

### Before Every Commit
- [ ] No hardcoded secrets or keys in code
- [ ] No sensitive data in logs (keys, plaintext, tokens)
- [ ] Client-side encryption verified (keys never sent to server)
- [ ] Input validation on server
- [ ] Error messages don't leak internal details
- [ ] Tests cover security-critical paths (100%)
- [ ] No XSS, SQL injection, or OWASP top 10 vulnerabilities
- [ ] All `innerHTML` assignments use `sanitizeHtml()` output

### Logging Rules
- ✅ Log: request IDs, timestamps, paste IDs, status codes
- ❌ NEVER log: plaintext content, encryption keys, passwords, delete tokens

### Error Handling
**Client:**
```typescript
// ✅ GOOD: User-friendly, doesn't expose internals
try {
  await uploadPaste(data);
} catch (error) {
  showError('Failed to create paste. Please try again.');
  console.error('Upload error:', error); // Debug only
}
```

**Server:**
```kotlin
// ✅ GOOD: Log details, return generic message
try {
    val paste = storage.getPaste(id)
    call.respond(paste)
} catch (e: Exception) {
    logger.error("Failed to retrieve paste $id", e)
    call.respond(HttpStatusCode.InternalServerError,
        ErrorResponse("Failed to retrieve paste"))
}
```

## API Endpoints

```
GET    /api/health              # Health check (includes DB connectivity)
GET    /api/pow                 # Get PoW challenge (204 if PoW disabled)
POST   /api/pastes              # Create paste (requires PoW if enabled)
GET    /api/pastes/:id          # Retrieve paste (404 if expired/missing)
DELETE /api/pastes/:id          # Delete paste by token (creator only)
POST   /api/pastes/:id/delete   # Delete paste by password-derived auth
POST   /api/pastes/:id/messages # Post encrypted chat message
GET    /api/pastes/:id/messages # Get all encrypted chat messages
```

### Request/Response Format

**POST /api/pastes:**
```json
{
  "ct": "base64url-ciphertext",
  "iv": "base64url-initialization-vector",
  "meta": {
    "expireTs": 1234567890,
    "mime": "text/plain",
    "allowChat": true
  },
  "pow": {
    "challenge": "abc123",
    "nonce": 42
  },
  "deleteAuth": "base64url-delete-authorization"
}
```

**Response (201 Created):**
```json
{
  "id": "paste-id",
  "deleteToken": "token-for-deletion"
}
```

**POST /api/pastes/:id/delete:**
```json
{
  "deleteAuth": "base64url-delete-authorization"
}
```

**POST /api/pastes/:id/messages:**
```json
{
  "ct": "base64url-encrypted-message",
  "iv": "base64url-iv"
}
```

**GET /api/pastes/:id/messages response:**
```json
{
  "messages": [
    { "ct": "...", "iv": "...", "timestamp": 1234567890 }
  ]
}
```

## Git Workflow & Commits

### Branches
- `main` / `master` — Production-ready. **NEVER push here directly.**
- `draft/*` — Feature branches for PRs. Use descriptive names: `draft/security-ux-bundle`
- AI-assigned branches follow the pattern: `claude/<description>-<sessionId>`

### Commit Messages
Format: `<type>: <description>`

Types:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only
- `test:` - Adding/updating tests
- `refactor:` - Code change (no bug fix, no new feature)
- `chore:` - Build process, dependencies, tooling
- `perf:` - Performance improvement
- `style:` - Code style/formatting (no logic change)

### Contextual Commits
Commit messages must align with branch purpose:

```
Branch: draft/security-ux-bundle
✅ GOOD: "feat: add rate limiting middleware"
✅ GOOD: "feat: improve error message clarity"
❌ BAD:  "docs: update deployment guide" (unrelated)
```

### Quality Gates
All CI checks must pass:
- ✅ Linting (ESLint)
- ✅ Type checking (tsc)
- ✅ Tests (Jest, Playwright)
- ✅ Coverage (85% minimum)
- ✅ Security audit

## AI Collaboration Rules

### Pull Request Philosophy
- **Small PRs are better**: 100-300 lines, focused changes
- **One concern per PR**: Single feature, bug fix, or refactor
- **Atomic changes**: Each PR independently deployable
- **Clear scope**: Easy to review, test, understand
- **Logical commits**: Break large work into separate commits for each major chunk
- **Atomic commits**: Each commit should be independently understandable and reviewable

### Pull Request Description (REQUIRED)

Every PR created with `gh pr create` MUST include a thorough description. Use this format:

```
## Summary

[1-3 sentences explaining what this PR does and why]

## Changes

[Bulleted list of what changed, grouped by area (e.g. Server, Client, Infrastructure)]

## Test plan

- [ ] [Specific things to verify manually or via CI]
- [ ] [Include make/test commands to run]
```

- **Never leave the description blank or use a one-liner**
- **Always include a test plan** with concrete verification steps
- **Group changes by area** (Server, Client, Infrastructure, etc.) when touching multiple parts of the codebase
- **No AI attribution**: Do NOT include "Generated with Claude", "Made with Cursor", or similar tags in any PR, commit, or doc

### Commit & Push Control (MANDATORY)

> Repeat of the critical rule above — this applies to AI assistants unconditionally:

- **NEVER push to `main` or `master`** — not even for small fixes or documentation
- **ALWAYS create a feature branch** before making any commit: `git checkout -b draft/<description>`
- **Push only to the feature branch**: `git push -u origin draft/<description>`
- **Open a PR**: `gh pr create` with full description and test plan
- **Push after each commit**: Push to the feature branch immediately after committing

### Workflow
1. Check branch: `git branch --show-current`
2. If on `main`/`master`, create feature branch immediately
3. Make all changes on the feature branch
4. Commit with descriptive message
5. Push to feature branch
6. Open PR via `gh pr create`

### GitHub Operations
- **Use `gh` CLI**: For all GitHub operations (PRs, issues, etc.)
- **Do NOT use GitKraken tools**: Always prefer `gh` over GitKraken MCP tools
- **Common commands**:
  - `gh pr create` - Create pull request
  - `gh pr view` - View PR details
  - `gh pr list` - List pull requests
  - `gh issue list` - List issues
  - `gh issue view` - View issue details

## Deployment

### Docker Compose
```bash
# Development (port 8080, HTTP)
docker-compose up -d

# Production (ports 80/443, HTTPS)
docker-compose -f docker-compose.prod.yml up -d

# Secure (HTTPS with Let's Encrypt)
docker-compose -f docker-compose.prod.yml -f docker-compose.secure.yml up -d
```

### Production Deployment
```bash
make deploy-prod              # VPS deployment with SSL
./scripts/deploy-prod.sh      # Direct script execution
```

### Multi-Architecture Support
```bash
make build-multiarch          # Build for AMD64 + ARM64
make push-multiarch REGISTRY=ghcr.io/username TAG=v1.0.0
```

## Important Patterns & Decisions

### Fragment-Based Key Storage
Encryption keys stored in URL fragment (`#salt:iv`) are never sent to the server in HTTP requests — browser-native zero-knowledge architecture.

### Password Key Derivation
PBKDF2 with 100,000 iterations, SHA-256, 16-byte salt. Provides both security and simple UX (single password unlocks paste and chat).

### Proof-of-Work Design
Client-side SHA-256 puzzle with configurable difficulty. Makes automated spam expensive without requiring user accounts. PoW solver yields every 1000 iterations to keep the UI responsive.

### Token Bucket Rate Limiting
Per-IP rate limiting: 30 tokens capacity, refills at 30/minute. Separate buckets for paste creation and message posting.

### Deletion Token Security
Deletion tokens hashed with SHA-256 + secret pepper (env variable) before storage — prevents rainbow table attacks.

### Password-Based Deletion + Brute-Force Protection
Anyone who knows the paste password can delete it. Delete authorization derived from password via PBKDF2 with modified salt (`salt + ":delete"`). `FailedAttemptTracker` blocks a paste ID after 10 failed attempts within 5 minutes.

### Server-Side Data Key Rotation (`DataKeyManager`)
`deleteAuth` hashes stored in SQLite are additionally encrypted with a server-managed AES-256-GCM key. `DataKeyManager` manages a keyring stored on disk, rotates keys on a configurable schedule, and supports decryption with any historical key. This is defense-in-depth on the server side — user content remains zero-knowledge.

### Delete Token Storage
Delete tokens are stored in `sessionStorage` (not `localStorage`) so they expire when the browser tab closes. Legacy tokens in `localStorage` are migrated on read and removed.

### Vendored Libraries
`marked.js` and `highlight.js` are vendored in `client/vendor/` to eliminate CDN dependencies, ensure offline functionality, and comply with the zero-external-resources policy.

### Markdown Safety Pipeline
All markdown-rendered content goes through: `marked.parse()` → `sanitizeHtml()` → `innerHTML`. `sanitizeHtml()` strips dangerous tags/attrs and removes external `<img>` tags to prevent tracking pixels.

### Paste Lifecycle
Pastes can be deleted by: time-based expiration (hourly cleanup), creator delete token, or password-based deletion by anyone with the password. All cascade-delete associated chat messages.

## Documentation

### Where to Find Information
- **Setup**: `docs/getting-started/SETUP.md`
- **Deployment**: `docs/deployment/DEPLOYMENT.md`
- **Architecture**: `docs/architecture/C4-DIAGRAMS.md`
- **Proof-of-Work**: `docs/architecture/PROOF_OF_WORK.md`
- **Testing**: `client/tests/README.md`
- **Security**: `docs/security/CHECKLIST.md`
- **Anonymous Chat**: `docs/features/ANONYMOUS-CHAT.md`
- **Bazel**: `docs/development/BAZEL_QUICKSTART.md`

### Documentation Organization
- **Change docs** (fix summaries, migration notes, etc.): Place in `docs/prs/<description>/`
- **NOT in repository root**: Keep root clean
- **PR-specific docs**: Use descriptive folder names

## Common Pitfalls to Avoid

1. **Sending keys to server**: Keys must ONLY exist in URL fragment
2. **Pushing to main/master**: ALWAYS use a feature branch and PR — this includes version bumps, tags, and release prep
3. **Pushing tags before PR is merged**: Create and push git tags ONLY after the commit lands in main via a merged PR
4. **Using `innerHTML` without sanitizeHtml()**: Always sanitize markdown output first
5. **Loading external resources**: Use vendored libs in `client/vendor/`, never CDN links
6. **Changing API contracts**: Investigate and fix tests/consumers, not the API
7. **Submitting untested code**: All new code requires tests in the same PR
8. **Decreasing coverage >5%**: Add tests to maintain coverage
9. **Pushing without CI verification**: Run `make ci-check` first
10. **Large PRs**: Break into smaller, focused PRs (100-300 lines)
11. **Logging sensitive data**: Never log keys, passwords, or plaintext
12. **Using `any` in TypeScript**: Use explicit types
13. **Reading compiled `.js` files**: Read source `.ts` files instead
14. **Duplicate HTML IDs across pages**: Use unique IDs across all HTML files
15. **AI attribution in PRs/commits**: No "Generated with Claude" or similar tags

## Performance Considerations

### Client
- Use native Web Crypto API (fast, no JS crypto dependencies)
- All third-party libs vendored locally (no network round-trip)
- PoW solver yields every 1000 iterations to prevent UI blocking
- Chat auto-polls every 30 seconds (not continuous)

### Server
- Connection pooling enabled (HikariCP)
- Rate limiting prevents abuse
- Efficient database queries with indexed paste IDs
- Response compression enabled
- Hourly cleanup of expired pastes

## Remember

1. **Zero-Knowledge**: If you're sending a key to the server, you're doing it wrong
2. **Never Push to Main**: Always feature branch → PR → review
3. **Test Everything**: No code without tests (same PR)
4. **Sanitize Before innerHTML**: Always use `sanitizeHtml()` for markdown/user content
5. **Type Safety**: Explicit types prevent bugs — no `any`
6. **Security First**: When in doubt, be more secure
7. **API Contracts**: Never break existing contracts without investigation
8. **Coverage Matters**: Maintain 85% minimum, critical code at 100%
9. **CI Before PR**: Run full CI checks locally before pushing
10. **Small PRs**: Focused, reviewable, atomic changes
