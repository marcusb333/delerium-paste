/**
 * TestUtils.kt - Utility functions for testing
 * 
 * Provides helper functions for creating test data, solving PoW challenges,
 * and setting up test environments.
 */

import java.io.File
import java.nio.file.Files
import java.security.MessageDigest
import java.time.Instant
import java.util.Base64
import org.jetbrains.exposed.sql.Database
import io.ktor.server.application.*
import io.ktor.server.routing.routing
import io.ktor.serialization.jackson.jackson
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import apiRoutes
import PasteRepo
import PasteMeta
import CreatePasteRequest
import PowSubmission
import PowService
import TokenBucket
import FailedAttemptTracker
import AppConfig
import AppMetrics

/**
 * Create a temporary SQLite database for testing
 * 
 * Uses a custom SQLite config that enables foreign keys via JDBC properties.
 * 
 * @return Pair of Database and File (for cleanup)
 */
fun createTestDatabase(): Pair<Database, File> {
    val testDbFile = File.createTempFile("test_paste_db", ".sqlite")
    testDbFile.deleteOnExit()
    // Enable foreign keys via JDBC URL parameter for SQLite
    // This ensures CASCADE DELETE works correctly
    val jdbcUrl = "jdbc:sqlite:${testDbFile.absolutePath}?foreign_keys=on"
    val db = Database.connect(jdbcUrl, driver = "org.sqlite.JDBC")
    return Pair(db, testDbFile)
}

/**
 * Create a test AppConfig with customizable values
 * 
 * @param powEnabled Whether PoW is enabled (default: true)
 * @param powDifficulty PoW difficulty (default: 8 for fast tests)
 * @param powTtl PoW TTL in seconds (default: 300)
 * @param rlEnabled Whether rate limiting is enabled (default: true)
 * @param rlCapacity Rate limiter capacity (default: 100)
 * @param rlRefill Rate limiter refill per minute (default: 100)
 * @param maxSizeBytes Maximum paste size (default: 1048576)
 * @param idLength Paste ID length (default: 10)
 */
fun createTestAppConfig(
    powEnabled: Boolean = true,
    powDifficulty: Int = 8,
    powTtl: Int = 300,
    rlEnabled: Boolean = true,
    rlCapacity: Int = 100,
    rlRefill: Int = 100,
    maxSizeBytes: Int = 1048576,
    idLength: Int = 10,
    dataEncKeyringPath: String = Files.createTempFile("test-keyring", ".json").toAbsolutePath().toString(),
    dataEncRotationDays: Long = 3650,
    dataEncMigrateOnStartup: Boolean = false
): AppConfig {
    return AppConfig(
        dbPath = "jdbc:sqlite:memory:",
        deletionPepper = "test-pepper-12345",
        powEnabled = powEnabled,
        powDifficulty = powDifficulty,
        powTtl = powTtl,
        rlEnabled = rlEnabled,
        rlCapacity = rlCapacity,
        rlRefill = rlRefill,
        maxSizeBytes = maxSizeBytes,
        idLength = idLength,
        dataEncKeyringPath = dataEncKeyringPath,
        dataEncRotationDays = dataEncRotationDays,
        dataEncMigrateOnStartup = dataEncMigrateOnStartup
    )
}

/**
 * Create a DataKeyManager for tests with a temporary keyring file.
 */
fun createTestKeyManager(rotationDays: Long = 3650): DataKeyManager {
    val keyringPath = Files.createTempFile("test-keyring", ".json").toAbsolutePath()
    keyringPath.toFile().deleteOnExit()
    return DataKeyManager(keyringPath, rotationDays, null)
}

/**
 * Create a valid test paste request
 * 
 * @param ct Ciphertext (default: valid base64url string)
 * @param iv IV (default: valid 12-byte base64url string)
 * @param expireTs Expiration timestamp (default: 1 hour from now)
 * @param mime MIME type (default: "text/plain")
 * @param allowChat If true, chat is enabled for this paste (default: true = chat always enabled)
 * @param allowKeyCaching If true, viewers can cache key for chat (default: null)
 * @param pow Optional PoW submission
 * @param deleteAuth Optional password-derived delete authorization
 */
fun createTestPasteRequest(
    ct: String = "dGVzdC1jaXBoZXJ0ZXh0LWNvbnRlbnQ",
    iv: String = "dGVzdC1pdi0xMjM",
    expireTs: Long = Instant.now().epochSecond + 3600,
    mime: String? = "text/plain",
    allowChat: Boolean? = true,
    allowKeyCaching: Boolean? = null,
    pow: PowSubmission? = null,
    deleteAuth: String? = null
): CreatePasteRequest {
    return CreatePasteRequest(
        ct = ct,
        iv = iv,
        meta = PasteMeta(
            expireTs = expireTs,
            mime = mime,
            allowKeyCaching = allowKeyCaching,
            allowChat = allowChat
        ),
        pow = pow,
        deleteAuth = deleteAuth
    )
}

/**
 * Solve a PoW challenge by brute force
 * 
 * This is a helper function for tests. It tries nonces sequentially
 * until it finds one that produces a hash with sufficient leading zero bits.
 * 
 * @param challenge The PoW challenge string
 * @param difficulty Required number of leading zero bits
 * @param maxAttempts Maximum number of nonces to try (default: 100000)
 * @return The nonce that solves the challenge, or null if not found within maxAttempts
 */
fun solvePowChallenge(challenge: String, difficulty: Int, maxAttempts: Int = 100000): Long? {
    val md = MessageDigest.getInstance("SHA-256")
    for (nonce in 0L until maxAttempts) {
        val input = "$challenge:$nonce".toByteArray()
        val digest = md.digest(input)
        val bits = leadingZeroBits(digest)
        if (bits >= difficulty) {
            return nonce
        }
    }
    return null
}

/**
 * Count leading zero bits in a byte array
 * Helper function for PoW solving
 */
private fun leadingZeroBits(b: ByteArray): Int {
    var bits = 0
    for (by in b) {
        val v = by.toInt() and 0xff
        if (v == 0) {
            bits += 8
            continue
        }
        bits += Integer.numberOfLeadingZeros(v) - 24
        break
    }
    return bits
}

/**
 * Base64url encode a byte array
 * 
 * @param bytes Byte array to encode
 * @return Base64url-encoded string without padding
 */
fun base64UrlEncode(bytes: ByteArray): String {
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
}

/**
 * Create a base64url-encoded string of a specific decoded size
 * 
 * @param decodedSize Desired decoded size in bytes
 * @return Base64url-encoded string that decodes to approximately decodedSize bytes
 */
fun createBase64UrlString(decodedSize: Int): String {
    val bytes = ByteArray(decodedSize)
    bytes.fill(0x42) // Fill with 'B' character
    return base64UrlEncode(bytes)
}

/**
 * Configure application module for testing
 * Helper function to set up ContentNegotiation and routing in testApplication blocks
 * 
 * @param repo Paste repository
 * @param rl Optional rate limiter
 * @param pow Optional PoW service
 * @param cfg Application configuration
 * @param failedAttemptTracker Optional brute-force tracker for password-based deletion
 */
fun Application.testModule(
    repo: PasteRepo,
    rl: TokenBucket?,
    pow: PowService?,
    cfg: AppConfig,
    failedAttemptTracker: FailedAttemptTracker? = null,
    metrics: AppMetrics? = null
) {
    install(ContentNegotiation) {
        jackson()
    }
    // Add security headers like in production
    intercept(io.ktor.server.application.ApplicationCallPipeline.Setup) {
        call.response.headers.append("Referrer-Policy", "no-referrer")
        call.response.headers.append("X-Content-Type-Options", "nosniff")
        call.response.headers.append("X-Frame-Options", "DENY")
        call.response.headers.append("X-XSS-Protection", "1; mode=block")
        call.response.headers.append("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        call.response.headers.append("Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self';")
        call.response.headers.append("Permissions-Policy", "accelerometer=(), geolocation=(), camera=(), microphone=(), payment=(), usb=()")
    }
    routing {
        apiRoutes(repo, rl, pow, cfg, failedAttemptTracker, metrics)
    }
}

/**
 * Simplified test module for basic tests
 * Creates a minimal configuration with no rate limiting or PoW
 * 
 * @param db Database connection
 * @param pepper Deletion token pepper
 */
fun Application.testModule(db: Database, pepper: String) {
    val keyManager = createTestKeyManager()
    val repo = PasteRepo(db, pepper, keyManager)
    val cfg = createTestAppConfig(powEnabled = false, rlEnabled = false)
    testModule(repo, null, null, cfg, null)
}
