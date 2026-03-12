package routes

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import io.ktor.server.testing.testApplication
import org.junit.After
import org.junit.Before
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import AppMetrics

class MetricsRouteTest {
    private lateinit var hikari: HikariDataSource
    private lateinit var appMetrics: AppMetrics

    @Before
    fun setUp() {
        hikari = HikariDataSource(HikariConfig().apply {
            jdbcUrl = "jdbc:sqlite::memory:"
            maximumPoolSize = 2
            poolName = "metrics-route-test"
        })
        appMetrics = AppMetrics(hikari)
    }

    @After
    fun tearDown() {
        hikari.close()
    }

    @Test
    fun `GET metrics returns 200 with prometheus text format`() = testApplication {
        application {
            routing {
                get("/metrics") {
                    call.respondText(appMetrics.registry.scrape(), ContentType.Text.Plain)
                }
            }
        }
        val response = client.get("/metrics")
        assertEquals(HttpStatusCode.OK, response.status)
        val body = response.bodyAsText()
        assertTrue(body.contains("# HELP") || body.contains("# TYPE"),
            "Expected Prometheus text format but got: ${body.take(200)}")
    }
}
