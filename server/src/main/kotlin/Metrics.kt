import com.zaxxer.hikari.HikariDataSource
import io.micrometer.core.instrument.Counter
import io.micrometer.core.instrument.binder.jvm.JvmGcMetrics
import io.micrometer.core.instrument.binder.jvm.JvmMemoryMetrics
import io.micrometer.core.instrument.binder.jvm.JvmThreadMetrics
import io.micrometer.prometheusmetrics.PrometheusConfig
import io.micrometer.prometheusmetrics.PrometheusMeterRegistry

/**
 * AppMetrics - Application-level Prometheus metrics registry.
 *
 * Holds all custom counters and registers JVM binders.
 * Pass this instance to apiRoutes() to increment counters on each API event.
 * The registry's scrape() output is served at GET /metrics (internal only).
 */
@Suppress("UNUSED_PARAMETER")
class AppMetrics(hikari: HikariDataSource) {
    val registry = PrometheusMeterRegistry(PrometheusConfig.DEFAULT)

    val pastesCreated: Counter = Counter.builder("delerium_pastes_created_total")
        .description("Total number of pastes created")
        .register(registry)

    val pastesDeleted: Counter = Counter.builder("delerium_pastes_deleted_total")
        .description("Total number of pastes deleted")
        .register(registry)

    val pastesViewed: Counter = Counter.builder("delerium_pastes_viewed_total")
        .description("Total number of pastes retrieved")
        .register(registry)

    val chatMessagesSent: Counter = Counter.builder("delerium_chat_messages_sent_total")
        .description("Total number of chat messages sent")
        .register(registry)

    val powFailures: Counter = Counter.builder("delerium_pow_failures_total")
        .description("Total proof-of-work validation failures")
        .register(registry)

    val rateLimitHits: Counter = Counter.builder("delerium_ratelimit_hits_total")
        .description("Total requests rejected by rate limiter")
        .register(registry)

    val deleteAuthFailures: Counter = Counter.builder("delerium_delete_auth_failures_total")
        .description("Total failed password-based delete authentication attempts")
        .register(registry)

    init {
        JvmGcMetrics().bindTo(registry)
        JvmMemoryMetrics().bindTo(registry)
        JvmThreadMetrics().bindTo(registry)
    }
}
