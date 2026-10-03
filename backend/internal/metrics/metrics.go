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
)
