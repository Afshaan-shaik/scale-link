package middleware

import (
	"net/http"
	"regexp"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/scalelink/scalelink/internal/metrics"
)

var shortCodePattern = regexp.MustCompile(`^/[A-Za-z0-9_-]{3,20}$`)

// Metrics records Prometheus HTTP request counts and latency histograms with bounded cardinality.
func Metrics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Don't track /metrics to avoid recursive loops or noise
		if r.URL.Path == "/metrics" {
			next.ServeHTTP(w, r)
			return
		}

		start := time.Now()
		rw, ok := w.(*ResponseWriter)
		if !ok {
			rw = &ResponseWriter{ResponseWriter: w, Status: http.StatusOK}
			w = rw
		}

		next.ServeHTTP(rw, r)

		duration := time.Since(start).Seconds()

		// Extract route pattern from chi context to avoid high cardinality
		path := ""
		if rctx := chi.RouteContext(r.Context()); rctx != nil {
			path = rctx.RoutePattern()
		}
		if path == "" {
			if shortCodePattern.MatchString(r.URL.Path) {
				path = "/{code}"
			} else {
				path = r.URL.Path
			}
		}

		statusStr := strconv.Itoa(rw.Status)
		metrics.HTTPRequestsTotal.WithLabelValues(r.Method, path, statusStr).Inc()
		metrics.HTTPRequestDuration.WithLabelValues(r.Method, path).Observe(duration)
	})
}
