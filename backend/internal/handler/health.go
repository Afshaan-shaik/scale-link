package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// HealthHandler serves liveness and readiness checks.
type HealthHandler struct {
	db    *pgxpool.Pool
	redis *redis.Client
	start time.Time
}

// NewHealthHandler creates a new HealthHandler.
func NewHealthHandler(db *pgxpool.Pool, rdb *redis.Client) *HealthHandler {
	return &HealthHandler{db: db, redis: rdb, start: time.Now()}
}

type healthResponse struct {
	Status   string            `json:"status"`
	Uptime   string            `json:"uptime"`
	Checks   map[string]string `json:"checks"`
	Timestamp string           `json:"timestamp"`
}

// Health handles GET /health — liveness + readiness.
func (h *HealthHandler) Health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	checks := map[string]string{}
	overall := "ok"

	// Postgres readiness
	if h.db != nil {
		if err := h.db.Ping(ctx); err != nil {
			checks["postgres"] = "unhealthy: " + err.Error()
			overall = "degraded"
		} else {
			checks["postgres"] = "ok"
		}
	} else {
		checks["postgres"] = "standalone / memory mode"
	}

	// Redis readiness (if configured)
	if h.redis != nil {
		if err := h.redis.Ping(ctx).Err(); err != nil {
			checks["redis"] = "unhealthy: " + err.Error()
			overall = "degraded"
		} else {
			checks["redis"] = "ok"
		}
	} else {
		checks["redis"] = "not configured"
	}

	status := http.StatusOK
	if overall != "ok" {
		status = http.StatusServiceUnavailable
	}

	respond(w, status, healthResponse{
		Status:    overall,
		Uptime:    time.Since(h.start).Round(time.Second).String(),
		Checks:    checks,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})
}
