package middleware

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/scalelink/scalelink/internal/ratelimit"
)

// RateLimit creates an HTTP middleware that enforces token-bucket rate limits.
func RateLimit(limiter *ratelimit.TokenBucketLimiter, action string, limitPerMinute int) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			identifier := "ip:" + r.RemoteAddr
			if ip := r.Header.Get("X-Real-IP"); ip != "" {
				identifier = "ip:" + ip
			}

			// If authenticated, rate limit per user
			if claims, ok := ClaimsFromContext(r.Context()); ok && claims.UserID != "" {
				identifier = "user:" + claims.UserID
			}

			res, err := limiter.Allow(r.Context(), action, identifier, limitPerMinute)
			if err == nil {
				w.Header().Set("X-RateLimit-Limit", fmt.Sprintf("%d", res.Capacity))
				w.Header().Set("X-RateLimit-Remaining", fmt.Sprintf("%d", res.Remaining))
			}

			if !res.Allowed {
				w.Header().Set("Retry-After", fmt.Sprintf("%d", res.RetryAfter))
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusTooManyRequests)
				_ = json.NewEncoder(w).Encode(map[string]interface{}{
					"error":       "rate limit exceeded",
					"retry_after": res.RetryAfter,
				})
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
