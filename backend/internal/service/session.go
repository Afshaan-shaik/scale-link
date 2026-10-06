package service

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/scalelink/scalelink/internal/config"
	"github.com/scalelink/scalelink/internal/model"
	"github.com/scalelink/scalelink/internal/repository"
)

var (
	ErrUnauthorized         = errors.New("unauthorized")
	ErrSessionExpired       = errors.New("session expired")
	ErrSessionRevoked       = errors.New("session revoked")
	ErrTransferNotFound     = errors.New("transfer token not found")
	ErrTransferExpired      = errors.New("transfer token has expired")
	ErrTransferAlreadyUsed  = errors.New("transfer token already used")
	ErrTransferRevoked      = errors.New("transfer token has been revoked")
)

type SessionService struct {
	cfg         *config.Config
	sessionRepo *repository.SessionRepository
}

func NewSessionService(cfg *config.Config, sessionRepo *repository.SessionRepository) *SessionService {
	return &SessionService{
		cfg:         cfg,
		sessionRepo: sessionRepo,
	}
}

// GenerateSecureToken generates a 256-bit cryptographically secure URL-safe token.
func GenerateSecureToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate secure random bytes: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// BootstrapSession attempts to validate an existing raw token.
// If valid and active, it touches and returns the existing session + workspace.
// If invalid, expired, revoked, or empty, it creates a brand new workspace and session.
func (s *SessionService) BootstrapSession(ctx context.Context, rawToken string) (*model.Session, *model.Workspace, string, error) {
	if rawToken != "" {
		tokenHash := repository.HashToken(rawToken)
		sess, err := s.sessionRepo.GetSessionByTokenHash(ctx, tokenHash)
		if err == nil && sess != nil {
			if sess.Status == "active" && !sess.IsExpired() {
				// Valid existing session: touch rolling activity
				rollingExpiry := time.Now().Add(time.Duration(s.cfg.SessionInactivityDays) * 24 * time.Hour)
				_ = s.sessionRepo.TouchSession(ctx, sess.ID, rollingExpiry)
				sess.ExpiresAt = rollingExpiry
				sess.LastSeenAt = time.Now()

				ws, err := s.sessionRepo.GetWorkspace(ctx, sess.WorkspaceID)
				if err == nil && ws != nil {
					return sess, ws, rawToken, nil
				}
			}
		}
	}

	// Create brand new workspace + session
	ws := &model.Workspace{
		ID:        uuid.New(),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		Status:    "active",
	}
	if err := s.sessionRepo.CreateWorkspace(ctx, ws); err != nil {
		return nil, nil, "", fmt.Errorf("create workspace: %w", err)
	}

	newToken, err := GenerateSecureToken()
	if err != nil {
		return nil, nil, "", fmt.Errorf("generate session token: %w", err)
	}
	tokenHash := repository.HashToken(newToken)
	expiresAt := time.Now().Add(time.Duration(s.cfg.SessionInactivityDays) * 24 * time.Hour)

	sess := &model.Session{
		ID:          uuid.New(),
		WorkspaceID: ws.ID,
		TokenHash:   tokenHash,
		CreatedAt:   time.Now(),
		LastSeenAt:  time.Now(),
		ExpiresAt:   expiresAt,
		Status:      "active",
	}

	if err := s.sessionRepo.CreateSession(ctx, sess); err != nil {
		return nil, nil, "", fmt.Errorf("create session: %w", err)
	}

	return sess, ws, newToken, nil
}

// ValidateSession verifies a bearer token, updates rolling activity, and returns the session and workspace.
func (s *SessionService) ValidateSession(ctx context.Context, rawToken string) (*model.Session, *model.Workspace, error) {
	if rawToken == "" {
		return nil, nil, ErrUnauthorized
	}

	tokenHash := repository.HashToken(rawToken)
	sess, err := s.sessionRepo.GetSessionByTokenHash(ctx, tokenHash)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, nil, ErrUnauthorized
		}
		return nil, nil, fmt.Errorf("validate session: %w", err)
	}

	if sess.Status == "revoked" || sess.RevokedAt != nil {
		return nil, nil, ErrSessionRevoked
	}
	if sess.IsExpired() {
		return nil, nil, ErrSessionExpired
	}

	// Touch rolling expiration
	rollingExpiry := time.Now().Add(time.Duration(s.cfg.SessionInactivityDays) * 24 * time.Hour)
	_ = s.sessionRepo.TouchSession(ctx, sess.ID, rollingExpiry)
	sess.ExpiresAt = rollingExpiry
	sess.LastSeenAt = time.Now()

	ws, err := s.sessionRepo.GetWorkspace(ctx, sess.WorkspaceID)
	if err != nil {
		return nil, nil, fmt.Errorf("get session workspace: %w", err)
	}

	return sess, ws, nil
}

// RevokeSession revokes a session by its raw token.
func (s *SessionService) RevokeSession(ctx context.Context, rawToken string) error {
	if rawToken == "" {
		return nil
	}
	tokenHash := repository.HashToken(rawToken)
	return s.sessionRepo.RevokeSessionByTokenHash(ctx, tokenHash)
}

// CreateTransfer generates a high-entropy, single-use, 10-minute transfer token for a workspace.
func (s *SessionService) CreateTransfer(ctx context.Context, workspaceID uuid.UUID) (string, *model.SessionTransfer, error) {
	// Verify workspace exists
	ws, err := s.sessionRepo.GetWorkspace(ctx, workspaceID)
	if err != nil || ws == nil {
		return "", nil, fmt.Errorf("workspace not found")
	}

	rawToken, err := GenerateSecureToken()
	if err != nil {
		return "", nil, fmt.Errorf("generate transfer token: %w", err)
	}

	tokenHash := repository.HashToken(rawToken)
	expiresAt := time.Now().Add(time.Duration(s.cfg.TransferTokenTTLMinutes) * time.Minute)

	transfer := &model.SessionTransfer{
		ID:          uuid.New(),
		WorkspaceID: workspaceID,
		TokenHash:   tokenHash,
		CreatedAt:   time.Now(),
		ExpiresAt:   expiresAt,
	}

	if err := s.sessionRepo.CreateTransfer(ctx, transfer); err != nil {
		return "", nil, fmt.Errorf("save transfer: %w", err)
	}

	return rawToken, transfer, nil
}

// ClaimTransfer redeems a transfer token: marks it as used, creates a NEW session attached to
// the existing workspace, and returns the new session credentials.
func (s *SessionService) ClaimTransfer(ctx context.Context, rawTransferToken string) (*model.Session, *model.Workspace, string, error) {
	if rawTransferToken == "" {
		return nil, nil, "", ErrTransferNotFound
	}

	tokenHash := repository.HashToken(rawTransferToken)
	transfer, err := s.sessionRepo.GetTransferByTokenHash(ctx, tokenHash)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, nil, "", ErrTransferNotFound
		}
		return nil, nil, "", fmt.Errorf("lookup transfer: %w", err)
	}

	if transfer.RevokedAt != nil {
		return nil, nil, "", ErrTransferRevoked
	}
	if transfer.UsedAt != nil {
		return nil, nil, "", ErrTransferAlreadyUsed
	}
	if transfer.IsExpired() {
		return nil, nil, "", ErrTransferExpired
	}

	// Mark transfer used immediately to prevent reuse
	if err := s.sessionRepo.MarkTransferUsed(ctx, transfer.ID); err != nil {
		return nil, nil, "", fmt.Errorf("mark transfer used: %w", err)
	}

	// Fetch target workspace
	ws, err := s.sessionRepo.GetWorkspace(ctx, transfer.WorkspaceID)
	if err != nil || ws == nil {
		return nil, nil, "", fmt.Errorf("workspace not found for transfer")
	}

	// Create a brand new session for this new browser context/tab
	newRawToken, err := GenerateSecureToken()
	if err != nil {
		return nil, nil, "", fmt.Errorf("generate session token: %w", err)
	}

	sessTokenHash := repository.HashToken(newRawToken)
	expiresAt := time.Now().Add(time.Duration(s.cfg.SessionInactivityDays) * 24 * time.Hour)

	newSession := &model.Session{
		ID:          uuid.New(),
		WorkspaceID: ws.ID,
		TokenHash:   sessTokenHash,
		CreatedAt:   time.Now(),
		LastSeenAt:  time.Now(),
		ExpiresAt:   expiresAt,
		Status:      "active",
	}

	if err := s.sessionRepo.CreateSession(ctx, newSession); err != nil {
		return nil, nil, "", fmt.Errorf("create transferred session: %w", err)
	}

	return newSession, ws, newRawToken, nil
}
