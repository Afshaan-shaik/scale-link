package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/scalelink/scalelink/internal/middleware"
	"github.com/scalelink/scalelink/internal/service"
)

// APIKeyHandler handles API key management endpoints.
type APIKeyHandler struct {
	authSvc *service.AuthService
}

// NewAPIKeyHandler creates a new APIKeyHandler.
func NewAPIKeyHandler(authSvc *service.AuthService) *APIKeyHandler {
	return &APIKeyHandler{authSvc: authSvc}
}

// ── POST /api/keys ────────────────────────────────────────────────────────────

type createKeyRequest struct {
	Name string `json:"name"`
}

// CreateKey handles POST /api/keys
func (h *APIKeyHandler) CreateKey(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	userID, _ := uuid.Parse(claims.UserID)

	var req createKeyRequest
	if err := decode(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		respondError(w, http.StatusBadRequest, "name is required")
		return
	}

	plainKey, key, err := h.authSvc.CreateAPIKey(r.Context(), userID, req.Name)
	if err != nil {
		zerolog.Ctx(r.Context()).Error().Err(err).Msg("create api key failed")
		respondError(w, http.StatusInternalServerError, "failed to create API key")
		return
	}

	// Return the plain key ONCE — it is never stored in plain form.
	respond(w, http.StatusCreated, map[string]interface{}{
		"id":         key.ID.String(),
		"name":       key.Name,
		"key":        plainKey, // shown once
		"key_prefix": key.KeyPrefix,
		"created_at": key.CreatedAt,
	})
}

// ── GET /api/keys ─────────────────────────────────────────────────────────────

// ListKeys handles GET /api/keys
func (h *APIKeyHandler) ListKeys(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	userID, _ := uuid.Parse(claims.UserID)

	keys, err := h.authSvc.ListAPIKeys(r.Context(), userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to list API keys")
		return
	}

	respond(w, http.StatusOK, map[string]interface{}{"keys": keys})
}

// ── DELETE /api/keys/{id} ─────────────────────────────────────────────────────

// RevokeKey handles DELETE /api/keys/{id}
func (h *APIKeyHandler) RevokeKey(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	userID, _ := uuid.Parse(claims.UserID)

	keyID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid key ID")
		return
	}

	if err := h.authSvc.RevokeAPIKey(r.Context(), keyID, userID); err != nil {
		if errors.Is(err, service.ErrInvalidCredentials) {
			respondError(w, http.StatusNotFound, "API key not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to revoke API key")
		return
	}

	respond(w, http.StatusOK, map[string]string{"status": "revoked"})
}
