package middleware

import (
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

type contextKey string

const RequestIDKey contextKey = "requestID"

// RequestID injects a unique request ID into the context and response headers.
func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-ID")
		if id == "" {
			id = uuid.New().String()
		}
		w.Header().Set("X-Request-ID", id)
		ctx := r.Context()
		// Store in context via zerolog logger
		logger := log.With().Str("request_id", id).Logger()
		r = r.WithContext(logger.WithContext(ctx))
		next.ServeHTTP(w, r)
	})
}

// Logger logs each request with method, path, status, latency, and request ID.
func Logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := &responseWriter{ResponseWriter: w, status: 200}

		defer func() {
			logger := zerolog.Ctx(r.Context())
			logger.Info().
				Str("method", r.Method).
				Str("path", r.URL.Path).
				Int("status", ww.status).
				Dur("latency_ms", time.Since(start)).
				Str("remote_addr", r.RemoteAddr).
				Str("user_agent", r.UserAgent()).
				Msg("request")
		}()

		next.ServeHTTP(ww, r)
	})
}

// Recoverer catches panics, logs them with a stack trace, and returns 500.
func Recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				logger := zerolog.Ctx(r.Context())
				logger.Error().Interface("panic", rec).Msg("recovered from panic")
				http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// responseWriter wraps http.ResponseWriter to capture the status code.
type responseWriter struct {
	http.ResponseWriter
	status  int
	written bool
}

func (rw *responseWriter) WriteHeader(status int) {
	if !rw.written {
		rw.status = status
		rw.written = true
		rw.ResponseWriter.WriteHeader(status)
	}
}

func (rw *responseWriter) Write(b []byte) (int, error) {
	if !rw.written {
		rw.WriteHeader(http.StatusOK)
	}
	return rw.ResponseWriter.Write(b)
}

// RealIP extracts the real client IP from X-Forwarded-For or X-Real-IP headers.
// This is important when running behind Nginx.
func RealIP(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			// XFF may be a comma-separated list; the first is the originating client
			for i := 0; i < len(xff); i++ {
				if xff[i] == ',' {
					r.RemoteAddr = xff[:i]
					break
				}
				if i == len(xff)-1 {
					r.RemoteAddr = xff
				}
			}
		} else if xri := r.Header.Get("X-Real-IP"); xri != "" {
			r.RemoteAddr = xri
		}
		next.ServeHTTP(w, r)
	})
}
