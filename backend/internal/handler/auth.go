package handler

import (
	"errors"
	"net/http"

	"github.com/rs/zerolog"

	"github.com/scalelink/scalelink/internal/service"
)

// AuthHandler handles authentication endpoints.
type AuthHandler struct {
	authSvc *service.AuthService
}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler(authSvc *service.AuthService) *AuthHandler {
	return &AuthHandler{authSvc: authSvc}
}

// ── POST /api/auth/register ───────────────────────────────────────────────────

type registerRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// Register handles POST /api/auth/register
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := decode(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Email == "" || req.Password == "" {
		respondError(w, http.StatusBadRequest, "email and password are required")
		return
	}

	user, err := h.authSvc.Register(r.Context(), req.Email, req.Password)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrEmailTaken):
			respondError(w, http.StatusConflict, "email already registered")
		default:
			zerolog.Ctx(r.Context()).Error().Err(err).Msg("register failed")
			respondError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}

	respond(w, http.StatusCreated, map[string]string{
		"id":    user.ID.String(),
		"email": user.Email,
	})
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// Login handles POST /api/auth/login
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := decode(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	tokens, err := h.authSvc.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCredentials) {
			respondError(w, http.StatusUnauthorized, "invalid email or password")
			return
		}
		zerolog.Ctx(r.Context()).Error().Err(err).Msg("login failed")
		respondError(w, http.StatusInternalServerError, "login failed")
		return
	}

	respond(w, http.StatusOK, tokens)
}

// ── POST /api/auth/refresh ────────────────────────────────────────────────────

type refreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// Refresh handles POST /api/auth/refresh
func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	var req refreshRequest
	if err := decode(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.RefreshToken == "" {
		respondError(w, http.StatusBadRequest, "refresh_token is required")
		return
	}

	tokens, err := h.authSvc.RefreshTokens(r.Context(), req.RefreshToken)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "invalid or expired refresh token")
		return
	}

	respond(w, http.StatusOK, tokens)
}

// ── POST /api/auth/me ─────────────────────────────────────────────────────────

// Me returns the current authenticated user's info.
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	// Auth middleware already validated the token and put claims in context.
	// Re-extracting here for the response.
	auth := r.Header.Get("Authorization")
	if len(auth) < 8 {
		respondError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	token := auth[7:] // strip "Bearer "
	claims, err := h.authSvc.ValidateAccessToken(token)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "invalid token")
		return
	}

	respond(w, http.StatusOK, map[string]string{
		"id":    claims.UserID,
		"email": claims.Email,
	})
}
