package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	// CacheHits counts cache-aside hits by cache category (link, negative).
	CacheHits = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Namespace: "scalelink",
			Subsystem: "cache",
			Name:      "hits_total",
			Help:      "Total number of cache hits in Redis.",
		},
		[]string{"type"},
	)

	// CacheMisses counts cache-aside misses.
	CacheMisses = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Namespace: "scalelink",
			Subsystem: "cache",
			Name:      "misses_total",
			Help:      "Total number of cache misses.",
		},
		[]string{"type"},
	)

	// RateLimitRejections counts requests blocked by the token bucket limiter.
	RateLimitRejections = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Namespace: "scalelink",
			Subsystem: "ratelimit",
			Name:      "rejections_total",
			Help:      "Total number of rate limit 429 rejections.",
		},
		[]string{"action"},
	)

	// HTTPRequestsTotal counts total HTTP requests processed.
	HTTPRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Namespace: "scalelink",
			Subsystem: "http",
			Name:      "requests_total",
			Help:      "Total number of HTTP requests processed.",
		},
		[]string{"method", "path", "status"},
	)

	// HTTPRequestDuration tracks latency of HTTP requests.
	HTTPRequestDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Namespace: "scalelink",
			Subsystem: "http",
			Name:      "request_duration_seconds",
			Help:      "Histogram of HTTP request latencies.",
			Buckets:   []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5},
		},
		[]string{"method", "path"},
	)

	// StreamEventsPublished counts click events published to Redis Streams.
	StreamEventsPublished = promauto.NewCounter(
		prometheus.CounterOpts{
			Namespace: "scalelink",
			Subsystem: "stream",
			Name:      "events_published_total",
			Help:      "Total number of click events published to Redis Streams.",
		},
	)

	// StreamEventsConsumed counts click events processed and committed by the worker.
	StreamEventsConsumed = promauto.NewCounter(
		prometheus.CounterOpts{
			Namespace: "scalelink",
			Subsystem: "stream",
			Name:      "events_consumed_total",
			Help:      "Total number of click events consumed and committed to database.",
		},
	)

	// StreamDeadLetterEvents counts events sent to dead letter stream after exceeding max retries.
	StreamDeadLetterEvents = promauto.NewCounter(
		prometheus.CounterOpts{
			Namespace: "scalelink",
			Subsystem: "stream",
			Name:      "dead_letter_events_total",
			Help:      "Total number of click events routed to dead letter stream.",
		},
	)

	// StreamLag reports current unacknowledged consumer group lag.
	StreamLag = promauto.NewGauge(
		prometheus.GaugeOpts{
			Namespace: "scalelink",
			Subsystem: "stream",
			Name:      "consumer_lag",
			Help:      "Current consumer group lag (unprocessed events) in Redis Streams.",
		},
	)

	// WorkerBatchDuration records the time taken to insert click batches.
	WorkerBatchDuration = promauto.NewHistogram(
		prometheus.HistogramOpts{
			Namespace: "scalelink",
			Subsystem: "worker",
			Name:      "batch_duration_seconds",
			Help:      "Latency of click analytics batch database writes.",
			Buckets:   []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1},
		},
	)
)
