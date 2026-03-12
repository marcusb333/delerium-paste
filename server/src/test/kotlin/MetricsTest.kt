import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import org.junit.Test
import kotlin.test.assertTrue
import kotlin.test.assertNotNull

class MetricsTest {

    private fun testDataSource(): HikariDataSource {
        val config = HikariConfig().apply {
            jdbcUrl = "jdbc:sqlite::memory:"
            maximumPoolSize = 2
            poolName = "test-pool"
        }
        return HikariDataSource(config)
    }

    @Test
    fun `AppMetrics initializes without error`() {
        val ds = testDataSource()
        val metrics = AppMetrics(ds)
        assertNotNull(metrics.registry)
        ds.close()
    }

    @Test
    fun `pastesCreated counter increments correctly`() {
        val ds = testDataSource()
        val metrics = AppMetrics(ds)
        metrics.pastesCreated.increment()
        metrics.pastesCreated.increment()
        assertTrue(metrics.pastesCreated.count() == 2.0)
        ds.close()
    }

    @Test
    fun `registry scrape returns non-empty Prometheus text`() {
        val ds = testDataSource()
        val metrics = AppMetrics(ds)
        val output = metrics.registry.scrape()
        assertTrue(output.contains("# HELP") || output.contains("# TYPE"),
            "Expected Prometheus exposition format but got: ${output.take(200)}")
        ds.close()
    }
}
