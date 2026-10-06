package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/scalelink/scalelink/internal/model"
	"github.com/scalelink/scalelink/internal/service"
)

type sessionContextKey string

const (
	SessionKey      sessionContextKey = "session"
	WorkspaceKey    sessionContextKey = "workspace"
	WorkspaceIDKey  sessionContextKey = "workspaceID"
)

// SessionRequired ensures that the request carries a valid anonymous session token.
// Tokens can be sent via Authorization: Bearer <token> or X-Session-Token: <token>.
func SessionRequired(sessionSvc *service.SessionService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := extractSessionToken(r)
			if token == "" {
				http.Error(w, `{"error":"unauthorized","message":"missing session token"}`, http.StatusUnauthorized)
				return
			}

			sess, ws, err := sessionSvc.ValidateSession(r.Context(), token)
			if err != nil {
				http.Error(w, `{"error":"unauthorized","message":"invalid or expired session"}`, http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), SessionKey, sess)
			ctx = context.WithValue(ctx, WorkspaceKey, ws)
			ctx = context.WithValue(ctx, WorkspaceIDKey, ws.ID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// OptionalSession inspects the request for an anonymous session token.
// If valid, it injects session and workspace into context; otherwise it continues normally.
func OptionalSession(sessionSvc *service.SessionService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := extractSessionToken(r)
			if token != "" {
				sess, ws, err := sessionSvc.ValidateSession(r.Context(), token)
				if err == nil && sess != nil && ws != nil {
					ctx := context.WithValue(r.Context(), SessionKey, sess)
					ctx = context.WithValue(ctx, WorkspaceKey, ws)
					ctx = context.WithValue(ctx, WorkspaceIDKey, ws.ID)
					r = r.WithContext(ctx)
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// SessionFromContext returns the authenticated anonymous session from context.
func SessionFromContext(ctx context.Context) (*model.Session, bool) {
	sess, ok := ctx.Value(SessionKey).(*model.Session)
	return sess, ok
}

// WorkspaceFromContext returns the authenticated workspace from context.
func WorkspaceFromContext(ctx context.Context) (*model.Workspace, bool) {
	ws, ok := ctx.Value(WorkspaceKey).(*model.Workspace)
	return ws, ok
}

// WorkspaceIDFromContext returns the authenticated workspace UUID from context.
func WorkspaceIDFromContext(ctx context.Context) (uuid.UUID, bool) {
	id, ok := ctx.Value(WorkspaceIDKey).(uuid.UUID)
	return id, ok
}

func extractSessionToken(r *http.Request) string {
	// 1. Check Authorization: Bearer <token>
	auth := r.Header.Get("Authorization")
	if auth != "" {
		parts := strings.SplitN(auth, " ", 2)
		if len(parts) == 2 && strings.EqualFold(parts[0], "bearer") {
			return strings.TrimSpace(parts[1])
		}
	}

	// 2. Fallback to X-Session-Token header
	if token := r.Header.Get("X-Session-Token"); token != "" {
		return strings.TrimSpace(token)
	}

	return ""
}
