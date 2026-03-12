/**
 * Routes.kt - HTTP API endpoint definitions
 *
 * This file defines all the REST API endpoints for the delerium-paste application:
 * - GET  /api/health - Lightweight service health check
 * - GET  /api/pow - Request a proof-of-work challenge
 * - POST /api/pastes - Create a new encrypted paste
 * - GET  /api/pastes/{id} - Retrieve an encrypted paste
 * - DELETE /api/pastes/{id}?token=... - Delete a paste with deletion token
 *
 * All endpoints include appropriate validation and error handling.
 */

import io.ktor.http.HttpStatusCode
import io.ktor.server.plugins.origin
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Routing
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import io.ktor.server.routing.head
import io.ktor.server.application.ApplicationCall

/**
 * Configure all API routes
 * 
 * Sets up the /api route group with all paste management endpoints.
 * 
 * @param repo Paste repository for database operations
 * @param rl Optional token bucket rate limiter
 * @param pow Optional proof-of-work service
 * @param cfg Application configuration
 * @param failedAttemptTracker Tracker for brute-force protection on password-based deletion
 */
private val trustedProxyIps: Set<String> =
    System.getenv("TRUSTED_PROXY_IPS")
        ?.split(",")
        ?.map { it.trim() }
        ?.filter { it.isNotEmpty() }
        ?.toSet()
        ?: emptySet()

private fun clientIp(call: ApplicationCall): String {
    val remoteHost = call.request.origin.remoteHost
    if (trustedProxyIps.isEmpty() || remoteHost !in trustedProxyIps) {
        return remoteHost
    }
    // Use X-Real-IP (set by nginx to $remote_addr) rather than X-Forwarded-For.
    // X-Forwarded-For's leftmost entry is client-controlled and can be spoofed to
    // bypass rate limiting. X-Real-IP is always the direct upstream peer IP.
    val header = call.request.headers["X-Real-IP"] ?: return remoteHost
    return header.trim().ifEmpty { remoteHost }
}

fun Routing.apiRoutes(repo: PasteRepo, rl: TokenBucket?, pow: PowService?, cfg: AppConfig, failedAttemptTracker: FailedAttemptTracker? = null, metrics: AppMetrics? = null) {
    route("/api") {
        /**
         * GET /api/health
         * Health check endpoint for orchestrators and monitors
         * 
         * Returns status "ok" if all systems are healthy, "degraded" if database is unhealthy.
         * Includes database connectivity check to verify persistence layer is working.
         */
        route("/health") {
            get {
                val dbHealthy = repo.checkHealth()
                val status = if (dbHealthy) "ok" else "degraded"
                call.respond(HealthStatus(status = status, databaseHealthy = dbHealthy))
            }
            head { call.respond(HttpStatusCode.OK) }
        }
        /**
         * GET /api/pow
         * Request a new proof-of-work challenge
         * Returns 204 No Content if PoW is disabled
         */
        get("/pow") {
            if (cfg.powEnabled && pow != null) call.respond(pow.newChallenge())
            else call.respond(HttpStatusCode.NoContent)
        }
        /**
         * POST /api/pastes
         * Create a new encrypted paste
         * 
         * Performs the following checks:
         * 1. Rate limiting (if enabled)
         * 2. JSON parsing and validation
         * 3. Proof-of-work verification (if enabled)
         * 4. Size validation (content and IV)
         * 5. Expiration time validation
         * 
         * Returns 201 with paste ID and deletion token on success
         */
        post("/pastes") {
            if (rl != null) {
                val ip = clientIp(call)
                if (!rl.allow("POST:$ip")) {
                    metrics?.rateLimitHits?.increment()
                    call.respond(HttpStatusCode.TooManyRequests, ErrorResponse("rate_limited")); return@post
                }
            }
            val body = try { call.receive<CreatePasteRequest>() } catch (e: Exception) {
                call.application.environment.log.error("POST /api/pastes parse failed: ${e.message}", e)
                call.respond(HttpStatusCode.BadRequest, ErrorResponse("invalid_json")); return@post
            }
            if (cfg.powEnabled && pow != null) {
                val sub = body.pow ?: run {
                    call.respond(HttpStatusCode.BadRequest, ErrorResponse("pow_required")); return@post
                }
                if (!pow.verify(sub.challenge, sub.nonce)) {
                    metrics?.powFailures?.increment()
                    call.respond(HttpStatusCode.BadRequest, ErrorResponse("pow_invalid")); return@post
                }
            }
            val ctSize = base64UrlSize(body.ct)
            val ivSize = base64UrlSize(body.iv)
            if (ctSize <= 0 || ivSize !in 12..64 || ctSize > cfg.maxSizeBytes) {
                call.respond(HttpStatusCode.BadRequest, ErrorResponse("size_invalid")); return@post
            }
            if (body.meta.expireTs <= (System.currentTimeMillis()/1000L) + 10) {
                call.respond(HttpStatusCode.BadRequest, ErrorResponse("expiry_too_soon")); return@post
            }
            val id = Ids.randomId(cfg.idLength)
            val deleteToken = Ids.randomId(24)
            try {
                repo.create(id, body.ct, body.iv, body.meta, deleteToken, body.deleteAuth)
                metrics?.pastesCreated?.increment()
                call.respond(HttpStatusCode.Created, CreatePasteResponse(id, deleteToken))
            } catch (_: Exception) {
                call.respond(HttpStatusCode.InternalServerError, ErrorResponse("db_error"))
            }
        }
        /**
         * GET /api/pastes/{id}
         * Retrieve an encrypted paste
         * 
         * Returns 404 if the paste doesn't exist or has expired.
         */
        get("/pastes/{id}") {
            val id = call.parameters["id"] ?: return@get call.respond(HttpStatusCode.BadRequest)
            val payload = repo.getPayloadIfAvailable(id) ?: return@get call.respond(HttpStatusCode.NotFound)
            metrics?.pastesViewed?.increment()
            call.respond(payload)
        }
        /**
         * DELETE /api/pastes/{id}?token=...
         * Delete a paste using its deletion token (creator-only)
         *
         * Returns 403 Forbidden if the token doesn't match.
         * Returns 204 No Content on successful deletion.
         */
        delete("/pastes/{id}") {
            val id = call.parameters["id"] ?: return@delete call.respond(HttpStatusCode.BadRequest)
            val token = call.request.queryParameters["token"] ?: return@delete call.respond(
                HttpStatusCode.BadRequest, ErrorResponse("missing_token"))
            val ok = repo.deleteIfTokenMatches(id, token)
            if (!ok) call.respond(HttpStatusCode.Forbidden, ErrorResponse("invalid_token"))
            else {
                metrics?.pastesDeleted?.increment()
                call.respond(HttpStatusCode.NoContent)
            }
        }
        /**
         * POST /api/pastes/{id}/delete
         * Delete a paste using password-derived authorization
         *
         * This allows anyone who knows the paste password to delete it.
         * The deleteAuth is derived client-side from the password.
         *
         * Brute-force protection: After 10 failed attempts within 5 minutes,
         * the paste ID is temporarily blocked from further attempts.
         *
         * Returns 429 Too Many Requests if brute-force protection triggered.
         * Returns 403 Forbidden if the auth doesn't match or feature is disabled.
         * Returns 204 No Content on successful deletion.
         */
        post("/pastes/{id}/delete") {
            val id = call.parameters["id"] ?: return@post call.respond(HttpStatusCode.BadRequest)
            
            // Check if this paste is blocked due to too many failed attempts
            if (failedAttemptTracker != null && failedAttemptTracker.isBlocked(id)) {
                call.respond(HttpStatusCode.TooManyRequests, ErrorResponse("too_many_attempts")); return@post
            }
            
            val body = try { call.receive<DeleteWithAuthRequest>() } catch (_: Exception) {
                call.respond(HttpStatusCode.BadRequest, ErrorResponse("invalid_json")); return@post
            }
            
            if (body.deleteAuth.isBlank()) {
                call.respond(HttpStatusCode.BadRequest, ErrorResponse("missing_auth")); return@post
            }
            
            val ok = repo.deleteIfAuthMatches(id, body.deleteAuth)
            if (!ok) {
                // Record the failed attempt
                failedAttemptTracker?.recordFailure(id)
                metrics?.deleteAuthFailures?.increment()
                call.respond(HttpStatusCode.Forbidden, ErrorResponse("invalid_auth"))
            } else {
                // Clear any failed attempts on success
                failedAttemptTracker?.recordSuccess(id)
                metrics?.pastesDeleted?.increment()
                call.respond(HttpStatusCode.NoContent)
            }
        }
        /**
         * POST /api/pastes/{id}/messages
         * Post an encrypted chat message to a paste
         *
         * All messages are encrypted client-side before being sent to the server.
         * The server only stores encrypted ciphertext and never sees plaintext.
         *
         * Rate limiting applies to prevent message spam.
         * Maximum 50 messages per paste (FIFO deletion).
         *
         * Returns 201 with message count on success.
         */
        post("/pastes/{id}/messages") {
            val id = call.parameters["id"] ?: return@post call.respond(HttpStatusCode.BadRequest)

            // Check if paste exists and is not expired
            repo.getIfAvailable(id) ?: return@post call.respond(
                HttpStatusCode.NotFound, ErrorResponse("paste_not_found"))

            // Rate limiting
            if (rl != null) {
                val ip = clientIp(call)
                if (!rl.allow("POST_MSG:$ip")) {
                    metrics?.rateLimitHits?.increment()
                    call.respond(HttpStatusCode.TooManyRequests, ErrorResponse("rate_limited")); return@post
                }
            }

            // Parse request body
            val body = try { call.receive<PostChatMessageRequest>() } catch (_: Exception) {
                call.respond(HttpStatusCode.BadRequest, ErrorResponse("invalid_json")); return@post
            }

            // Validate message size (prevent huge encrypted messages)
            val ctSize = base64UrlSize(body.ct)
            val ivSize = base64UrlSize(body.iv)
            if (ctSize <= 0 || ivSize !in 12..64 || ctSize > 10000) { // 10KB max per message
                call.respond(HttpStatusCode.BadRequest, ErrorResponse("message_size_invalid")); return@post
            }

            try {
                val count = repo.addChatMessage(id, body.ct, body.iv)
                metrics?.chatMessagesSent?.increment()
                call.respond(HttpStatusCode.Created, PostChatMessageResponse(count))
            } catch (_: Exception) {
                call.respond(HttpStatusCode.InternalServerError, ErrorResponse("db_error"))
            }
        }
        /**
         * GET /api/pastes/{id}/messages
         * Retrieve all encrypted chat messages for a paste
         *
         * Returns messages ordered by timestamp (oldest first).
         * All messages are encrypted - decryption happens client-side.
         *
         * Returns 404 if the paste doesn't exist or has expired.
         */
        get("/pastes/{id}/messages") {
            val id = call.parameters["id"] ?: return@get call.respond(HttpStatusCode.BadRequest)

            // Check if paste exists and is not expired
            repo.getIfAvailable(id) ?: return@get call.respond(
                HttpStatusCode.NotFound, ErrorResponse("paste_not_found"))

            try {
                val messages = repo.getChatMessages(id)
                call.respond(GetChatMessagesResponse(messages))
            } catch (_: Exception) {
                call.respond(HttpStatusCode.InternalServerError, ErrorResponse("db_error"))
            }
        }
	}
}

