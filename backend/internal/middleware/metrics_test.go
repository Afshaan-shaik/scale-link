package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/scalelink/scalelink/internal/middleware"
)

func TestMetricsMiddleware(t *testing.T) {
	r := chi.NewRouter()
	r.Use(middleware.Metrics)

	r.Get("/ping", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("pong"))
	})

	r.Get("/{code}", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusFound)
	})

	// Test static route
	req1 := httptest.NewRequest("GET", "/ping", nil)
	rr1 := httptest.NewRecorder()
	r.ServeHTTP(rr1, req1)

	if rr1.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rr1.Code)
	}

	// Test parameterized route
	req2 := httptest.NewRequest("GET", "/abc123", nil)
	rr2 := httptest.NewRecorder()
	r.ServeHTTP(rr2, req2)

	if rr2.Code != http.StatusFound {
		t.Fatalf("expected status 302, got %d", rr2.Code)
	}

	// Test /metrics bypass
	req3 := httptest.NewRequest("GET", "/metrics", nil)
	rr3 := httptest.NewRecorder()
	r.ServeHTTP(rr3, req3)
}
