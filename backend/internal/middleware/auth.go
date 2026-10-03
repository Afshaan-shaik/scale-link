package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/scalelink/scalelink/internal/service"
)

type userContextKey string

const UserKey userContextKey = "user"
const UserIDKey userContextKey = "userID"

// AuthRequired validates a JWT Bearer token and injects user claims into context.
// Returns 401 if the token is missing or invalid.
func AuthRequired(authSvc *service.AuthService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, err := extractClaims(r, authSvc)
			if err != nil {
				http.Error(w, `{"error":"unauthorized","message":"`+err.Error()+`"}`, http.StatusUnauthorized)
				return
			}
			ctx := context.WithValue(r.Context(), UserKey, claims)
			ctx = context.WithValue(ctx, UserIDKey, claims.UserID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// OptionalAuth attempts to extract JWT claims but does not reject the request if absent.
func OptionalAuth(authSvc *service.AuthService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if claims, err := extractClaims(r, authSvc); err == nil {
				ctx := context.WithValue(r.Context(), UserKey, claims)
				ctx = context.WithValue(ctx, UserIDKey, claims.UserID)
				r = r.WithContext(ctx)
			}
			next.ServeHTTP(w, r)
		})
	}
}

// ClaimsFromContext retrieves JWT claims from request context.
func ClaimsFromContext(ctx context.Context) (*service.Claims, bool) {
	claims, ok := ctx.Value(UserKey).(*service.Claims)
	return claims, ok
}

// UserIDFromContext retrieves the user ID string from context.
func UserIDFromContext(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(UserIDKey).(string)
	return id, ok && id != ""
}

func extractClaims(r *http.Request, authSvc *service.AuthService) (*service.Claims, error) {
	auth := r.Header.Get("Authorization")
	if auth == "" {
		return nil, fmt.Errorf("missing Authorization header")
	}
	parts := strings.SplitN(auth, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
		return nil, fmt.Errorf("invalid Authorization header format")
	}
	return authSvc.ValidateAccessToken(parts[1])
}
