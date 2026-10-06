package handler

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/scalelink/scalelink/internal/middleware"
	"github.com/scalelink/scalelink/internal/service"
)

type SessionHandler struct {
	sessionSvc *service.SessionService
}

func NewSessionHandler(sessionSvc *service.SessionService) *SessionHandler {
	return &SessionHandler{
		sessionSvc: sessionSvc,
	}
}

type BootstrapRequest struct {
	Token string `json:"token"`
}

type BootstrapResponse struct {
	Session struct {
		ID          uuid.UUID `json:"id"`
		WorkspaceID uuid.UUID `json:"workspace_id"`
		Status      string    `json:"status"`
		ExpiresAt   time.Time `json:"expires_at"`
		Token       string    `json:"token"`
	} `json:"session"`
	Workspace struct {
		ID        uuid.UUID `json:"id"`
		Status    string    `json:"status"`
		CreatedAt time.Time `json:"created_at"`
	} `json:"workspace"`
}

// Bootstrap handles session initialization or restoration.
func (h *SessionHandler) Bootstrap(w http.ResponseWriter, r *http.Request) {
	var req BootstrapRequest
	_ = decode(r, &req)

	token := strings.TrimSpace(req.Token)
	if token == "" {
		// Also check Authorization header or X-Session-Token
		if auth := r.Header.Get("Authorization"); auth != "" {
			parts := strings.SplitN(auth, " ", 2)
			if len(parts) == 2 && strings.EqualFold(parts[0], "bearer") {
				token = strings.TrimSpace(parts[1])
			}
		}
		if token == "" {
			token = strings.TrimSpace(r.Header.Get("X-Session-Token"))
		}
	}

	sess, ws, activeToken, err := h.sessionSvc.BootstrapSession(r.Context(), token)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to bootstrap session")
		return
	}

	var resp BootstrapResponse
	resp.Session.ID = sess.ID
	resp.Session.WorkspaceID = sess.WorkspaceID
	resp.Session.Status = sess.Status
	resp.Session.ExpiresAt = sess.ExpiresAt
	resp.Session.Token = activeToken

	resp.Workspace.ID = ws.ID
	resp.Workspace.Status = ws.Status
	resp.Workspace.CreatedAt = ws.CreatedAt

	respond(w, http.StatusOK, resp)
}

// Revoke revokes the current session token.
func (h *SessionHandler) Revoke(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token string `json:"token"`
	}
	_ = decode(r, &req)

	token := strings.TrimSpace(req.Token)
	if token == "" {
		if auth := r.Header.Get("Authorization"); auth != "" {
			parts := strings.SplitN(auth, " ", 2)
			if len(parts) == 2 && strings.EqualFold(parts[0], "bearer") {
				token = strings.TrimSpace(parts[1])
			}
		}
		if token == "" {
			token = strings.TrimSpace(r.Header.Get("X-Session-Token"))
		}
	}

	if token != "" {
		_ = h.sessionSvc.RevokeSession(r.Context(), token)
	}

	respond(w, http.StatusOK, map[string]bool{"revoked": true})
}

// CreateTransfer creates a 10-minute one-time transfer token for the current workspace.
func (h *SessionHandler) CreateTransfer(w http.ResponseWriter, r *http.Request) {
	wsID, ok := middleware.WorkspaceIDFromContext(r.Context())
	if !ok {
		respondError(w, http.StatusUnauthorized, "session required to transfer workspace")
		return
	}

	rawTransferToken, transfer, err := h.sessionSvc.CreateTransfer(r.Context(), wsID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to create transfer token")
		return
	}

	respond(w, http.StatusCreated, map[string]any{
		"transfer_token": rawTransferToken,
		"workspace_id":   wsID,
		"expires_at":     transfer.ExpiresAt,
	})
}

// ClaimTransfer redeems a one-time transfer token and creates a new session attached to the transferred workspace.
func (h *SessionHandler) ClaimTransfer(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TransferToken string `json:"transfer_token"`
	}
	if err := decode(r, &req); err != nil || strings.TrimSpace(req.TransferToken) == "" {
		respondError(w, http.StatusBadRequest, "transfer_token is required")
		return
	}

	sess, ws, newToken, err := h.sessionSvc.ClaimTransfer(r.Context(), strings.TrimSpace(req.TransferToken))
	if err != nil {
		switch {
		case errors.Is(err, service.ErrTransferNotFound):
			respondError(w, http.StatusNotFound, "transfer token not found or invalid")
		case errors.Is(err, service.ErrTransferExpired):
			respondError(w, http.StatusGone, "transfer token has expired")
		case errors.Is(err, service.ErrTransferAlreadyUsed):
			respondError(w, http.StatusConflict, "transfer token has already been used")
		case errors.Is(err, service.ErrTransferRevoked):
			respondError(w, http.StatusForbidden, "transfer token was revoked")
		default:
			respondError(w, http.StatusInternalServerError, "failed to claim transfer")
		}
		return
	}

	var resp BootstrapResponse
	resp.Session.ID = sess.ID
	resp.Session.WorkspaceID = sess.WorkspaceID
	resp.Session.Status = sess.Status
	resp.Session.ExpiresAt = sess.ExpiresAt
	resp.Session.Token = newToken

	resp.Workspace.ID = ws.ID
	resp.Workspace.Status = ws.Status
	resp.Workspace.CreatedAt = ws.CreatedAt

	respond(w, http.StatusOK, resp)
}
