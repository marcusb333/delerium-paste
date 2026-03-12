/**
 * MetricsCounterTest.kt - Verifies that API route events increment the correct Prometheus counters.
 *
 * Each test exercises one route event and asserts the corresponding counter on AppMetrics.
 */

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import org.jetbrains.exposed.sql.Database
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.io.File
import java.time.Instant
import kotlin.test.assertEquals

class MetricsCounterTest {
    private lateinit var hikari: HikariDataSource
    private lateinit var appMetrics: AppMetrics
    private lateinit var db: Database
    private lateinit var repo: PasteRepo
    private lateinit var testDbFile: File
    private val mapper = jacksonObjectMapper()

    @Before
    fun setUp() {
        // Unique pool name per instance to avoid HikariCP pool name conflicts
        hikari = HikariDataSource(HikariConfig().apply {
            jdbcUrl = "jdbc:sqlite::memory:"
            maximumPoolSize = 2
            poolName = "metrics-counter-test-${System.nanoTime()}"
        })
        appMetrics = AppMetrics(hikari)
        val (database, file) = createTestDatabase()
        db = database
        testDbFile = file
        repo = PasteRepo(db, "test-pepper-metrics", createTestKeyManager())
    }

    @After
    fun tearDown() {
        hikari.close()
        if (::testDbFile.isInitialized && testDbFile.exists()) testDbFile.delete()
    }

    // ── Paste counters ───────────────────────────────────────────────────────

    @Test
    fun `pastesCreated increments on successful paste creation`() = testApplication {
        val cfg = createTestAppConfig(powEnabled = false, rlEnabled = false)
        application { testModule(repo, null, null, cfg, metrics = appMetrics) }

        val response = client.post("/api/pastes") {
            contentType(ContentType.Application.Json)
            setBody(mapper.writeValueAsString(createTestPasteRequest()))
        }

        assertEquals(HttpStatusCode.Created, response.status)
        assertEquals(1.0, appMetrics.pastesCreated.count())
    }

    @Test
    fun `pastesViewed increments on successful paste retrieval`() = testApplication {
        val cfg = createTestAppConfig(powEnabled = false, rlEnabled = false)
        application { testModule(repo, null, null, cfg, metrics = appMetrics) }

        // Create a paste first
        val createResp = client.post("/api/pastes") {
            contentType(ContentType.Application.Json)
            setBody(mapper.writeValueAsString(createTestPasteRequest()))
        }
        val id = mapper.readValue(createResp.bodyAsText(), CreatePasteResponse::class.java).id

        // Reset counter to isolate the view event
        val beforeView = appMetrics.pastesViewed.count()

        val response = client.get("/api/pastes/$id")
        assertEquals(HttpStatusCode.OK, response.status)
        assertEquals(beforeView + 1.0, appMetrics.pastesViewed.count())
    }

    @Test
    fun `pastesDeleted increments on successful token-based delete`() = testApplication {
        val cfg = createTestAppConfig(powEnabled = false, rlEnabled = false)
        application { testModule(repo, null, null, cfg, metrics = appMetrics) }

        val createResp = client.post("/api/pastes") {
            contentType(ContentType.Application.Json)
            setBody(mapper.writeValueAsString(createTestPasteRequest()))
        }
        val created = mapper.readValue(createResp.bodyAsText(), CreatePasteResponse::class.java)

        val response = client.delete("/api/pastes/${created.id}?token=${created.deleteToken}")
        assertEquals(HttpStatusCode.NoContent, response.status)
        assertEquals(1.0, appMetrics.pastesDeleted.count())
    }

    @Test
    fun `pastesDeleted increments on successful password-based delete`() = testApplication {
        val cfg = createTestAppConfig(powEnabled = false, rlEnabled = false)
        application { testModule(repo, null, null, cfg, metrics = appMetrics) }

        val deleteAuth = "test-delete-auth-hash"
        val createResp = client.post("/api/pastes") {
            contentType(ContentType.Application.Json)
            setBody(mapper.writeValueAsString(createTestPasteRequest(deleteAuth = deleteAuth)))
        }
        val id = mapper.readValue(createResp.bodyAsText(), CreatePasteResponse::class.java).id

        val response = client.post("/api/pastes/$id/delete") {
            contentType(ContentType.Application.Json)
            setBody("""{"deleteAuth":"$deleteAuth"}""")
        }
        assertEquals(HttpStatusCode.NoContent, response.status)
        assertEquals(1.0, appMetrics.pastesDeleted.count())
    }

    // ── Security / rejection counters ────────────────────────────────────────

    @Test
    fun `deleteAuthFailures increments on wrong password-based delete`() = testApplication {
        val cfg = createTestAppConfig(powEnabled = false, rlEnabled = false)
        application { testModule(repo, null, null, cfg, metrics = appMetrics) }

        val createResp = client.post("/api/pastes") {
            contentType(ContentType.Application.Json)
            setBody(mapper.writeValueAsString(createTestPasteRequest(deleteAuth = "correct-auth")))
        }
        val id = mapper.readValue(createResp.bodyAsText(), CreatePasteResponse::class.java).id

        val response = client.post("/api/pastes/$id/delete") {
            contentType(ContentType.Application.Json)
            setBody("""{"deleteAuth":"wrong-auth"}""")
        }
        assertEquals(HttpStatusCode.Forbidden, response.status)
        assertEquals(1.0, appMetrics.deleteAuthFailures.count())
    }

    @Test
    fun `rateLimitHits increments on rate-limited paste creation`() = testApplication {
        val cfg = createTestAppConfig(powEnabled = false, rlEnabled = true, rlCapacity = 1, rlRefill = 1)
        val rl = TokenBucket(cfg.rlCapacity, cfg.rlRefill)
        application { testModule(repo, rl, null, cfg, metrics = appMetrics) }

        // First request consumes the single token
        client.post("/api/pastes") {
            contentType(ContentType.Application.Json)
            setBody(mapper.writeValueAsString(createTestPasteRequest()))
        }

        // Second request should be rate-limited
        val response = client.post("/api/pastes") {
            contentType(ContentType.Application.Json)
            setBody(mapper.writeValueAsString(createTestPasteRequest()))
        }
        assertEquals(HttpStatusCode.TooManyRequests, response.status)
        assertEquals(1.0, appMetrics.rateLimitHits.count())
    }

    @Test
    fun `powFailures increments on invalid PoW submission`() = testApplication {
        val cfg = createTestAppConfig(powEnabled = true, powDifficulty = 8, rlEnabled = false)
        val pow = PowService(cfg.powDifficulty, cfg.powTtl)
        application { testModule(repo, null, pow, cfg, metrics = appMetrics) }

        val challenge = pow.newChallenge()
        val request = createTestPasteRequest(
            pow = PowSubmission(challenge.challenge, nonce = 999999999L) // almost certainly wrong nonce
        )

        val response = client.post("/api/pastes") {
            contentType(ContentType.Application.Json)
            setBody(mapper.writeValueAsString(request))
        }
        assertEquals(HttpStatusCode.BadRequest, response.status)
        assertEquals(1.0, appMetrics.powFailures.count())
    }

    // ── Chat counter ─────────────────────────────────────────────────────────

    @Test
    fun `chatMessagesSent increments on successful chat message`() = testApplication {
        val cfg = createTestAppConfig(powEnabled = false, rlEnabled = false)
        application { testModule(repo, null, null, cfg, metrics = appMetrics) }

        val createResp = client.post("/api/pastes") {
            contentType(ContentType.Application.Json)
            setBody(mapper.writeValueAsString(createTestPasteRequest(allowChat = true)))
        }
        val id = mapper.readValue(createResp.bodyAsText(), CreatePasteResponse::class.java).id

        val response = client.post("/api/pastes/$id/messages") {
            contentType(ContentType.Application.Json)
            setBody("""{"ct":"dGVzdC1jaXBoZXJ0ZXh0","iv":"dGVzdC1pdi0xMjM"}""")
        }
        assertEquals(HttpStatusCode.Created, response.status)
        assertEquals(1.0, appMetrics.chatMessagesSent.count())
    }
}
