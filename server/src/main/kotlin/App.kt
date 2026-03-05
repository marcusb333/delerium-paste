/**
 * App.kt - Main application configuration and initialization
 * 
 * This file contains the entry point for the delerium-paste Ktor server application.
 * It handles:
 * - Application configuration loading from application.conf
 * - Database connection pooling with HikariCP
 * - Security headers (CSP, CORS, X-Content-Type-Options, etc.)
 * - Plugin installation (compression, content negotiation, logging, CORS)
 * - Initialization of core services (rate limiter, proof-of-work, paste repository)
 * - Routing setup
 */

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.module.kotlin.KotlinModule
import io.ktor.serialization.jackson.jackson
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationCallPipeline
import io.ktor.server.application.call
import io.ktor.server.application.install
import io.ktor.server.plugins.calllogging.CallLogging
import io.ktor.server.plugins.compression.Compression
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.cors.routing.CORS
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.response.respond
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import org.jetbrains.exposed.sql.Database
import io.ktor.http.CacheControl
import io.ktor.http.ContentType
import io.ktor.server.http.content.staticFiles
import io.ktor.server.response.respondText
import java.security.SecureRandom
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.IOException
import java.nio.file.Paths
import java.util.concurrent.TimeUnit

/**
 * Application configuration data class
 * Holds all runtime configuration values loaded from application.conf and environment variables
 * 
 * @property dbPath Database JDBC connection string
 * @property deletionPepper Secret pepper value for hashing deletion tokens (from env var)
 * @property powEnabled Whether proof-of-work is enabled for paste creation
 * @property powDifficulty Number of leading zero bits required in PoW solution
 * @property powTtl Time-to-live for PoW challenges in seconds
 * @property rlEnabled Whether rate limiting is enabled
 * @property rlCapacity Maximum number of tokens in the rate limiter bucket
 * @property rlRefill Number of tokens to refill per minute
 * @property maxSizeBytes Maximum allowed size for paste content in bytes
 * @property idLength Length of randomly generated paste IDs
 */
data class AppConfig(
    val dbPath: String,
    val deletionPepper: String,
    val powEnabled: Boolean,
    val powDifficulty: Int,
    val powTtl: Int,
    val rlEnabled: Boolean,
    val rlCapacity: Int,
    val rlRefill: Int,
    val maxSizeBytes: Int,
    val idLength: Int,
    val dataEncKeyringPath: String,
    val dataEncRotationDays: Long,
    val dataEncMigrateOnStartup: Boolean
)

/**
 * Main application module function
 * 
 * This extension function on Application is the entry point for the Ktor server.
 * It performs the following initialization steps:
 * 1. Loads configuration from application.conf and environment variables
 * 2. Installs HTTP plugins (compression, JSON serialization, logging, CORS)
 * 3. Adds security headers to all responses
 * 4. Sets up database connection pool
 * 5. Initializes services (repository, rate limiter, proof-of-work)
 * 6. Configures API routes
 */
/**
 * Generate a cryptographically secure random pepper value
 * 
 * @param lengthBytes Number of random bytes to generate (default: 32 bytes = 64 hex characters)
 * @return Hex-encoded random string suitable for use as a pepper
 */
fun generateSecurePepper(lengthBytes: Int = 32): String {
    val random = SecureRandom()
    val bytes = ByteArray(lengthBytes)
    random.nextBytes(bytes)
    return bytes.joinToString("") { "%02x".format(it) }
}

fun Application.module() {
    val cfg = environment.config
    val envPepper = System.getenv("DELETION_TOKEN_PEPPER")
    val deletionPepper = if (envPepper != null && envPepper.isNotBlank()) {
        envPepper
    } else {
        // Auto-generate a secure random pepper if not provided
        val generatedPepper = generateSecurePepper()
        environment.log.info(
            "ℹ️  DELETION_TOKEN_PEPPER not set. Auto-generated a secure random pepper. " +
            "For production, consider setting DELETION_TOKEN_PEPPER explicitly for consistency across restarts."
        )
        generatedPepper
    }
    
    val envDbPath = System.getenv("DB_PATH")
    val dbPath = envDbPath ?: cfg.property("storage.dbPath").getString()
    val dbUser = System.getenv("DB_USER") ?: cfg.propertyOrNull("storage.dbUser")?.getString()
    val dbPassword = System.getenv("DB_PASSWORD") ?: cfg.propertyOrNull("storage.dbPassword")?.getString()
    val dataEncKeyringPath = System.getenv("DATA_ENC_KEYRING_PATH")
        ?: cfg.propertyOrNull("storage.dataEnc.keyringPath")?.getString()
        ?: "/app/keyring.json"
    val dataEncRotationDays = System.getenv("DATA_ENC_ROTATION_DAYS")
        ?.toLongOrNull()
        ?: cfg.propertyOrNull("storage.dataEnc.rotationDays")?.getString()?.toLongOrNull()
        ?: 30L
    val dataEncMigrateOnStartup = System.getenv("DATA_ENC_MIGRATE_ON_STARTUP")
        ?.toBooleanStrictOrNull()
        ?: cfg.propertyOrNull("storage.dataEnc.migrateOnStartup")?.getString()?.toBooleanStrictOrNull()
        ?: false
    val appCfg = AppConfig(
        dbPath = dbPath,
        deletionPepper = deletionPepper,
        powEnabled = cfg.propertyOrNull("storage.pow.enabled")?.getString()?.toBoolean() ?: true,
        powDifficulty = cfg.property("storage.pow.difficulty").getString().toInt(),
        powTtl = cfg.property("storage.pow.ttlSeconds").getString().toInt(),
        rlEnabled = cfg.propertyOrNull("storage.rateLimit.enabled")?.getString()?.toBoolean() ?: true,
        rlCapacity = cfg.property("storage.rateLimit.capacity").getString().toInt(),
        rlRefill = cfg.property("storage.rateLimit.refillPerMinute").getString().toInt(),
        maxSizeBytes = cfg.property("storage.paste.maxSizeBytes").getString().toInt(),
        idLength = cfg.property("storage.paste.idLength").getString().toInt(),
        dataEncKeyringPath = dataEncKeyringPath,
        dataEncRotationDays = dataEncRotationDays,
        dataEncMigrateOnStartup = dataEncMigrateOnStartup
    )

    val staticDir = System.getenv("STATIC_DIR")
        ?: cfg.propertyOrNull("app.staticDir")?.getString()
        ?: "/app/static"

    install(Compression)
    install(ContentNegotiation) {
        jackson {
            registerModule(KotlinModule.Builder().build())
            disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        }
    }
    install(CallLogging) { level = org.slf4j.event.Level.INFO }
    install(StatusPages) {
        exception<Throwable> { call, cause ->
            call.application.environment.log.error(
                "Unhandled exception on ${call.request.local.uri}", cause
            )
            call.respond(
                io.ktor.http.HttpStatusCode.InternalServerError
            )
        }
    }
    // CORS is handled by Nginx reverse proxy
    // install(CORS) { ... }
    intercept(ApplicationCallPipeline.Setup) {
        call.response.headers.append("Referrer-Policy", "no-referrer")
        call.response.headers.append("X-Content-Type-Options", "nosniff")
        call.response.headers.append("X-Frame-Options", "DENY")
        call.response.headers.append("X-XSS-Protection", "1; mode=block")
        call.response.headers.append("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        call.response.headers.append("Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self';")
        call.response.headers.append("Permissions-Policy", "accelerometer=(), geolocation=(), camera=(), microphone=(), payment=(), usb=()")
        // COEP, COOP, CORP are too restrictive for API endpoints that need CORS
        // These headers are better suited for HTML pages served by the frontend
        // call.response.headers.append("Cross-Origin-Embedder-Policy", "require-corp")
        // call.response.headers.append("Cross-Origin-Opener-Policy", "same-origin")
        // call.response.headers.append("Cross-Origin-Resource-Policy", "same-origin")
    }

    val hikari = HikariDataSource(HikariConfig().apply {
        jdbcUrl = appCfg.dbPath
        maximumPoolSize = 5
        driverClassName = "org.postgresql.Driver"
        if (dbUser != null) username = dbUser
        if (dbPassword != null) password = dbPassword
    })
    val db = Database.connect(hikari)
    val seedKeyring = System.getenv("DATA_ENC_KEYRING")
    val keyManager = DataKeyManager(
        Paths.get(appCfg.dataEncKeyringPath),
        appCfg.dataEncRotationDays,
        seedKeyring
    )
    val repo = PasteRepo(db, appCfg.deletionPepper, keyManager)
    val rl = if (appCfg.rlEnabled) TokenBucket(appCfg.rlCapacity, appCfg.rlRefill) else null
    val pow = if (appCfg.powEnabled) PowService(appCfg.powDifficulty, appCfg.powTtl) else null
    val failedAttemptTracker = FailedAttemptTracker(maxAttempts = 10, windowSeconds = 300)

    // Start background task to clean up expired pastes periodically
    val cleanupScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    cleanupScope.launch {
        while (true) {
            try {
                val deleted = repo.deleteExpired()
                if (deleted > 0) {
                    environment.log.info("🧹 Cleaned up $deleted expired paste(s)")
                }
            } catch (e: IOException) {
                environment.log.error("Error during expired paste cleanup", e)
            } finally {
                delay(TimeUnit.HOURS.toMillis(1)) // Run cleanup every hour
            }
        }
    }

    // Rotate at-rest encryption key on schedule and re-encrypt stored data
    cleanupScope.launch {
        while (true) {
            try {
                if (keyManager.rotateIfDue()) {
                    val updated = repo.rotateAtRestEncryption()
                    environment.log.info("🔐 Rotated data encryption key, re-encrypted $updated rows")
                }
            } catch (e: Exception) {
                environment.log.error("Error during data key rotation", e)
            } finally {
                delay(TimeUnit.HOURS.toMillis(6))
            }
        }
    }

    // One-time migration pass: encrypt any legacy rows at startup
    if (appCfg.dataEncMigrateOnStartup) {
        cleanupScope.launch {
            try {
                val updated = repo.rotateAtRestEncryption()
                environment.log.info("🔐 One-time at-rest encryption migration updated $updated rows")
            } catch (e: Exception) {
                environment.log.error("Error during at-rest encryption migration", e)
            }
        }
    }

    // Add periodic cleanup of failed attempt tracker entries
    cleanupScope.launch {
        while (true) {
            delay(TimeUnit.HOURS.toMillis(1))
            try {
                val cleaned = failedAttemptTracker.cleanupExpired()
                if (cleaned > 0) {
                    environment.log.info("🧹 Cleaned up $cleaned expired failed attempt entries")
                }
            } catch (e: Exception) {
                environment.log.error("Error during failed attempt tracker cleanup", e)
            }
        }
    }

    routing {
        // Health check (non-API, for load balancers/probes)
        get("/health") {
            call.respondText("OK", ContentType.Text.Plain)
        }

        // API routes
        apiRoutes(repo, rl, pow, appCfg, failedAttemptTracker)

        // Static files (served from filesystem directory)
        val staticRoot = java.io.File(staticDir)
        if (staticRoot.isDirectory) {
            staticFiles("/", staticRoot) {
                default("index.html")
                cacheControl { url ->
                    when {
                        url.path.endsWith(".js") -> listOf(CacheControl.MaxAge(maxAgeSeconds = 31536000, visibility = CacheControl.Visibility.Public))
                        url.path.endsWith(".css") -> listOf(CacheControl.MaxAge(maxAgeSeconds = 31536000, visibility = CacheControl.Visibility.Public))
                        url.path.endsWith(".html") -> listOf(CacheControl.NoCache(null))
                        else -> listOf(CacheControl.MaxAge(maxAgeSeconds = 3600, visibility = CacheControl.Visibility.Public))
                    }
                }
            }
        }
    }
}
