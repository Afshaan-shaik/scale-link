package metrics_test

import (
	"testing"

	"github.com/scalelink/scalelink/internal/metrics"
)

func TestMetricsRegistered(t *testing.T) {
	// Verify all Prometheus metrics are non-nil and can be manipulated safely
	metrics.CacheHits.WithLabelValues("link").Inc()
	metrics.CacheMisses.WithLabelValues("link").Inc()
	metrics.RateLimitRejections.WithLabelValues("redirect").Inc()
	metrics.HTTPRequestsTotal.WithLabelValues("GET", "/health", "200").Inc()
	metrics.HTTPRequestDuration.WithLabelValues("GET", "/health").Observe(0.005)
	metrics.StreamEventsPublished.Inc()
	metrics.StreamEventsConsumed.Add(1)
	metrics.StreamDeadLetterEvents.Inc()
	metrics.StreamLag.Set(0)
	metrics.WorkerBatchDuration.Observe(0.012)
}
