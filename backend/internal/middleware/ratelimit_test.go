package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/scalelink/scalelink/internal/ratelimit"
)

func TestRateLimitMiddleware_AllowsWhenLimiterNil(t *testing.T) {
	limiter := ratelimit.NewTokenBucketLimiter(nil)
	mw := RateLimit(limiter, "test", 100)

	handlerCalled := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handlerCalled = true
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest("GET", "/test", nil)
	rec := httptest.NewRecorder()

	mw(next).ServeHTTP(rec, req)

	assert.True(t, handlerCalled)
	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "100", rec.Header().Get("X-RateLimit-Limit"))
	assert.Equal(t, "100", rec.Header().Get("X-RateLimit-Remaining"))
}
