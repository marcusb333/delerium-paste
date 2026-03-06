# Delerium Paste Server API Documentation

## Overview

The Delerium Paste Server provides a REST API for creating, retrieving, and deleting encrypted pastes. All encryption happens client-side; the server only stores encrypted content (ciphertext) and never sees the decryption key.

**Base URL**: `http://localhost:8080/api` (or your server's base URL)

**Content Type**: All requests and responses use `application/json`

**Authentication**: No authentication required. Deletion requires a secret token returned when creating a paste.

## Error Response Format

All error responses follow this format:

```json
{
  "error": "error_code"
}
```

Common error codes:

- `invalid_json` - Request body is not valid JSON
- `pow_required` - Proof-of-work is required but not provided
- `pow_invalid` - Proof-of-work solution is invalid
- `size_invalid` - Content or IV size is invalid
- `expiry_too_soon` - Expiration time is too soon (must be at least 10 seconds in the future)
- `rate_limited` - Rate limit exceeded
- `db_error` - Database error occurred
- `missing_token` - Deletion token is missing
- `invalid_token` - Deletion token is invalid

## Endpoints

### GET /api/health

Lightweight health check endpoint intended for orchestrators and monitoring systems.

**Request**: None

**Response**:

- **200 OK**

  ```json
  {
    "status": "ok",
    "timestampMs": 1700000000000,
    "powEnabled": true,
    "rateLimitingEnabled": true
  }
  ```

**Response Fields**:

- `status` (string): `"ok"` when the service is healthy
- `timestampMs` (integer): Server timestamp in milliseconds when the response was generated
- `powEnabled` (boolean): Indicates whether proof-of-work is currently enforced
- `rateLimitingEnabled` (boolean): Indicates whether rate limiting is active

**Example**:

```bash
curl http://localhost:8080/api/health
```

**Notes**:

- `HEAD /api/health` is also supported and returns `200 OK` with no body
- A 200 response confirms the API process is running and configuration loaded; use other endpoints for deeper diagnostics

---

### GET /api/pow

Request a proof-of-work challenge. This endpoint is used when proof-of-work is enabled to obtain a challenge that must be solved before creating a paste.

**Request**: None

**Response**:

- **200 OK** (when PoW is enabled):

  ```json
  {
    "challenge": "base64url-encoded-challenge-string",
    "difficulty": 10,
    "expiresAt": 1234567890
  }
  ```

- **204 No Content** (when PoW is disabled)

**Response Fields**:

- `challenge` (string): Base64url-encoded random challenge string
- `difficulty` (integer): Number of leading zero bits required in the solution hash
- `expiresAt` (integer): Unix timestamp when this challenge expires

**Example**:

```bash
curl http://localhost:8080/api/pow
```

**Proof-of-Work Solving**:

To solve a PoW challenge, find a nonce (integer) such that:

```text
SHA-256(challenge:nonce)
```

produces a hash with at least `difficulty` leading zero bits.

Example algorithm:

1. Start with nonce = 0
2. Compute hash = SHA-256(challenge + ":" + nonce)
3. Count leading zero bits in hash
4. If count >= difficulty, you've found a solution
5. Otherwise, increment nonce and repeat

**Notes**:

- Challenges expire after a configurable TTL (default: 180 seconds)
- Each challenge can only be used once
- Lower difficulty values (8-10) are faster to solve but provide less protection
- Higher difficulty values (16-20) are slower but provide stronger protection

---

### POST /api/pastes

Create a new encrypted paste.

**Request Body**:

```json
{
  "ct": "base64url-encoded-ciphertext",
  "iv": "base64url-encoded-initialization-vector",
  "meta": {
    "expireTs": 1234567890,
    "viewsAllowed": 5,
    "mime": "text/plain",
    "singleView": false
  },
  "pow": {
    "challenge": "challenge-string-from-pow-endpoint",
    "nonce": 12345
  }
}
```

**Request Fields**:

- `ct` (string, required): Base64url-encoded ciphertext (encrypted paste content)
- `iv` (string, required): Base64url-encoded initialization vector (12-64 bytes when decoded)
- `meta` (object, required): Paste metadata
  - `expireTs` (integer, required): Unix timestamp when paste expires (must be at least 10 seconds in the future)
  - `viewsAllowed` (integer, optional): Maximum number of views allowed (null = unlimited)
  - `mime` (string, optional): MIME type hint for the content (e.g., "text/plain", "text/html")
  - `singleView` (boolean, optional): If true, paste is deleted after first view
- `pow` (object, optional): Proof-of-work solution (required if PoW is enabled)
  - `challenge` (string, required): Challenge string from `/api/pow`
  - `nonce` (integer, required): Nonce that solves the challenge

**Response**:

- **201 Created**:

  ```json
  {
    "id": "abc123xyz",
    "deleteToken": "secret-deletion-token-12345"
  }
  ```

- **400 Bad Request**: Invalid request (see error codes above)
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Database error

**Response Fields**:

- `id` (string): Unique paste identifier (used in URLs)
- `deleteToken` (string): Secret token for deleting the paste (keep this private!)

**Validation Rules**:

- `ct` size (decoded) must be > 0 and <= `maxSizeBytes` (default: 1MB)
- `iv` size (decoded) must be between 12 and 64 bytes
- `expireTs` must be at least 10 seconds in the future
- If PoW is enabled, `pow` must be provided and valid

**Example**:

```bash
curl -X POST http://localhost:8080/api/pastes \
  -H "Content-Type: application/json" \
  -d '{
    "ct": "dGVzdC1jaXBoZXJ0ZXh0",
    "iv": "dGVzdC1pdi0xMjM",
    "meta": {
      "expireTs": 1735689600,
      "viewsAllowed": 5,
      "mime": "text/plain",
      "singleView": false
    }
  }'
```

**With Proof-of-Work**:

```bash
# 1. Get challenge
CHALLENGE=$(curl -s http://localhost:8080/api/pow | jq -r '.challenge')
DIFFICULTY=$(curl -s http://localhost:8080/api/pow | jq -r '.difficulty')

# 2. Solve challenge (simplified - you'd implement actual PoW solving)
NONCE=12345  # This would be computed by solving the challenge

# 3. Create paste with PoW solution
curl -X POST http://localhost:8080/api/pastes \
  -H "Content-Type: application/json" \
  -d "{
    \"ct\": \"dGVzdC1jaXBoZXJ0ZXh0\",
    \"iv\": \"dGVzdC1pdi0xMjM\",
    \"meta\": {
      \"expireTs\": 1735689600
    },
    \"pow\": {
      \"challenge\": \"$CHALLENGE\",
      \"nonce\": $NONCE
    }
  }"
```

**Notes**:

- The `deleteToken` should be kept secret and used only for deletion
- Pastes are automatically deleted when they expire
- Single-view pastes are deleted immediately after first retrieval
- Pastes with view limits are deleted when the limit is reached
- Rate limiting applies per IP address (when enabled)

---

### GET /api/pastes/{id}

Retrieve an encrypted paste.

**Path Parameters**:

- `id` (string, required): Paste identifier

**Response**:

- **200 OK**:

  ```json
  {
    "ct": "base64url-encoded-ciphertext",
    "iv": "base64url-encoded-initialization-vector",
    "meta": {
      "expireTs": 1234567890,
      "viewsAllowed": 5,
      "mime": "text/plain",
      "singleView": false
    },
    "viewsLeft": 4
  }
  ```

- **400 Bad Request**: Missing or invalid `id` parameter
- **404 Not Found**: Paste doesn't exist, has expired, or was deleted

**Response Fields**:

- `ct` (string): Encrypted content (ciphertext)
- `iv` (string): Initialization vector for decryption
- `meta` (object): Original metadata from paste creation
- `viewsLeft` (integer, nullable): Number of views remaining (null if unlimited)

**Example**:

```bash
curl http://localhost:8080/api/pastes/abc123xyz
```

**Behavior**:

- View count is incremented on each retrieval (if not single-view and limit not reached)
- Single-view pastes are deleted immediately after first retrieval
- Pastes with view limits are deleted when the limit is reached
- Expired pastes return 404

**Notes**:

- The decryption key is never sent to the server (it's in the URL fragment on the client)
- Decryption happens entirely client-side
- Each retrieval increments the view count (unless it's the last view)

---

### DELETE /api/pastes/{id}

Delete a paste using its deletion token.

**Path Parameters**:

- `id` (string, required): Paste identifier

**Query Parameters**:

- `token` (string, required): Deletion token returned when creating the paste

**Response**:

- **204 No Content**: Paste successfully deleted
- **400 Bad Request**: Missing `id` or `token` parameter
- **403 Forbidden**: Invalid token or paste doesn't exist

**Example**:

```bash
curl -X DELETE "http://localhost:8080/api/pastes/abc123xyz?token=secret-deletion-token-12345"
```

**Notes**:

- The deletion token is required and must match the token used when creating the paste
- Invalid tokens return 403 (not 404) to prevent information leakage
- Once deleted, a paste cannot be retrieved

---

## Data Models

### CreatePasteRequest

```json
{
  "ct": "string",
  "iv": "string",
  "meta": {
    "expireTs": 0,
    "viewsAllowed": null,
    "mime": null,
    "singleView": null
  },
  "pow": null
}
```

### PasteMeta

```json
{
  "expireTs": 0,
  "viewsAllowed": null,
  "mime": null,
  "singleView": null
}
```

### PowSubmission

```json
{
  "challenge": "string",
  "nonce": 0
}
```

### PowChallenge

```json
{
  "challenge": "string",
  "difficulty": 0,
  "expiresAt": 0
}
```

### CreatePasteResponse

```json
{
  "id": "string",
  "deleteToken": "string"
}
```

### PastePayload

```json
{
  "ct": "string",
  "iv": "string",
  "meta": {
    "expireTs": 0,
    "viewsAllowed": null,
    "mime": null,
    "singleView": null
  },
  "viewsLeft": null
}
```

### ErrorResponse

```json
{
  "error": "string"
}
```

---

## Rate Limiting

When rate limiting is enabled, the server uses a token bucket algorithm to limit requests per IP address.

**Default Limits** (configurable):

- Capacity: 30 tokens
- Refill Rate: 30 tokens per minute

**Behavior**:

- Each POST request to `/api/pastes` consumes one token
- Tokens are refilled continuously over time
- When the bucket is empty, requests return `429 Too Many Requests` with error `rate_limited`
- Rate limiting is applied per IP address (or X-Forwarded-For header if behind a trusted proxy)

**Rate Limit Headers**:
Currently, no rate limit headers are included in responses. This may be added in future versions.

---

## Proof of Work

Proof-of-work (PoW) is an optional feature that requires clients to solve a computational puzzle before creating a paste. This helps prevent spam and abuse.

**How It Works**:

1. Client requests a challenge from `/api/pow`
2. Client solves the challenge by finding a nonce that produces a hash with sufficient leading zero bits
3. Client includes the challenge and nonce in the paste creation request
4. Server verifies the solution before creating the paste

**Difficulty Levels**:

- **8-10 bits**: Light protection (~256-1024 attempts, fast)
- **12-14 bits**: Medium protection (~4K-16K attempts, balanced)
- **16-18 bits**: Strong protection (~64K-256K attempts, slower)
- **20+ bits**: Very strong (exponentially more expensive)

**Default Configuration**:

- Enabled: `true`
- Difficulty: `10` bits
- TTL: `180` seconds

**Solving Algorithm**:

```javascript
function solvePowChallenge(challenge, difficulty) {
  const crypto = require('crypto');
  for (let nonce = 0; nonce < 1000000; nonce++) {
    const hash = crypto.createHash('sha256')
      .update(challenge + ':' + nonce)
      .digest();
    const leadingZeros = countLeadingZeroBits(hash);
    if (leadingZeros >= difficulty) {
      return nonce;
    }
  }
  return null;
}

function countLeadingZeroBits(bytes) {
  let bits = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    bits += Math.clz32(byte) - 24;
    break;
  }
  return bits;
}
```

**Notes**:

- Challenges expire after the TTL period
- Each challenge can only be used once
- PoW can be disabled in server configuration
- Lower difficulty values are faster to solve but provide less protection

---

## Security Considerations

### Client-Side Encryption

- **All encryption happens client-side**. The server never sees the decryption key.
- The decryption key is typically stored in the URL fragment (after `#`), which is never sent to the server.
- The server only stores encrypted content (ciphertext) and initialization vectors.

### Deletion Tokens

- Deletion tokens are cryptographically hashed before storage (using SHA-256 with a secret pepper).
- Tokens are returned only once when creating a paste.
- Invalid tokens return 403 (not 404) to prevent information leakage about paste existence.

### Expiration Handling

- Pastes are automatically deleted when they expire.
- Expired pastes return 404 when retrieved.
- A background cleanup task runs periodically to remove expired pastes from the database.

### View Limits

- Single-view pastes are deleted immediately after first retrieval.
- Pastes with view limits are deleted when the limit is reached.
- View counts are incremented atomically to prevent race conditions.

### Rate Limiting

- Rate limiting helps prevent abuse and ensures fair resource usage.
- Limits are applied per IP address (or X-Forwarded-For header if configured).

### Proof of Work

- PoW makes paste creation computationally expensive, deterring automated spam.
- Challenges expire to prevent replay attacks.
- Each challenge can only be used once.

### Security Headers

The server sets the following security headers on all responses:

- `Referrer-Policy: no-referrer`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self';`
- `Permissions-Policy: accelerometer=(), geolocation=(), camera=(), microphone=(), payment=(), usb=()`
- `Cross-Origin-Embedder-Policy: require-corp`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`

### CORS

- CORS is enabled for all origins (configurable).
- Allowed methods: GET, POST, DELETE
- All headers are allowed.

---

## Example Workflows

### Creating and Retrieving a Paste

```bash
# 1. Create a paste
RESPONSE=$(curl -s -X POST http://localhost:8080/api/pastes \
  -H "Content-Type: application/json" \
  -d '{
    "ct": "dGVzdC1jaXBoZXJ0ZXh0",
    "iv": "dGVzdC1pdi0xMjM",
    "meta": {
      "expireTs": 1735689600,
      "viewsAllowed": 5
    }
  }')

PASTE_ID=$(echo $RESPONSE | jq -r '.id')
DELETE_TOKEN=$(echo $RESPONSE | jq -r '.deleteToken')

# 2. Retrieve the paste
curl http://localhost:8080/api/pastes/$PASTE_ID

# 3. Delete the paste
curl -X DELETE "http://localhost:8080/api/pastes/$PASTE_ID?token=$DELETE_TOKEN"
```

### Creating a Single-View Paste

```bash
curl -X POST http://localhost:8080/api/pastes \
  -H "Content-Type: application/json" \
  -d '{
    "ct": "dGVzdC1jaXBoZXJ0ZXh0",
    "iv": "dGVzdC1pdi0xMjM",
    "meta": {
      "expireTs": 1735689600,
      "singleView": true
    }
  }'
```

### Creating a Paste with Proof-of-Work

```bash
# 1. Get PoW challenge
POW_RESPONSE=$(curl -s http://localhost:8080/api/pow)
CHALLENGE=$(echo $POW_RESPONSE | jq -r '.challenge')
DIFFICULTY=$(echo $POW_RESPONSE | jq -r '.difficulty')

# 2. Solve challenge (simplified - implement actual PoW solving)
# In practice, you'd implement the solving algorithm in your client
NONCE=12345

# 3. Create paste with PoW solution
curl -X POST http://localhost:8080/api/pastes \
  -H "Content-Type: application/json" \
  -d "{
    \"ct\": \"dGVzdC1jaXBoZXJ0ZXh0\",
    \"iv\": \"dGVzdC1pdi0xMjM\",
    \"meta\": {
      \"expireTs\": 1735689600
    },
    \"pow\": {
      \"challenge\": \"$CHALLENGE\",
      \"nonce\": $NONCE
    }
  }"
```

---

## Configuration

Server configuration is managed through `application.conf` and environment variables. Key settings:

- **Database**: SQLite database path (default: `/data/pastes.db`)
- **PoW**: Enabled/disabled, difficulty, TTL
- **Rate Limiting**: Enabled/disabled, capacity, refill rate
- **Paste Limits**: Maximum size, ID length
- **Deletion Pepper**: Secret value for hashing deletion tokens (from `DELETION_TOKEN_PEPPER` env var)

See `application.conf` for default values and configuration options.

---

## Error Handling

All errors return appropriate HTTP status codes:

- **400 Bad Request**: Invalid request format or validation failure
- **403 Forbidden**: Invalid deletion token
- **404 Not Found**: Paste doesn't exist or has expired
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Server error (database, etc.)

Error responses include a JSON body with an `error` field describing the issue.

---

## Version

Current API version: **1.3.0**

API versioning may be added in future releases if breaking changes are needed.
