package repository

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/scalelink/scalelink/internal/model"
)

var (
	memSessionOnce sync.Once
	memWorkspaces  = make(map[uuid.UUID]*model.Workspace)
	memSessions    = make(map[string]*model.Session)         // tokenHash -> Session
	memTransfers   = make(map[string]*model.SessionTransfer) // tokenHash -> Transfer
	memSessionMu   sync.RWMutex
)

func loadMemSessionCache() {
	tmpDir := os.TempDir()
	cachePath := filepath.Join(tmpDir, "scalelink_session_cache.json")
	data, err := os.ReadFile(cachePath)
	if err != nil {
		return
	}

	var state struct {
		Workspaces []*model.Workspace       `json:"workspaces"`
		Sessions   []*model.Session         `json:"sessions"`
		Transfers  []*model.SessionTransfer `json:"transfers"`
	}
	if err := json.Unmarshal(data, &state); err == nil {
		for _, w := range state.Workspaces {
			memWorkspaces[w.ID] = w
		}
		for _, s := range state.Sessions {
			memSessions[s.TokenHash] = s
		}
		for _, t := range state.Transfers {
			memTransfers[t.TokenHash] = t
		}
	}
}

func saveMemSessionCache() {
	tmpDir := os.TempDir()
	cachePath := filepath.Join(tmpDir, "scalelink_session_cache.json")

	var state struct {
		Workspaces []*model.Workspace       `json:"workspaces"`
		Sessions   []*model.Session         `json:"sessions"`
		Transfers  []*model.SessionTransfer `json:"transfers"`
	}
	for _, w := range memWorkspaces {
		state.Workspaces = append(state.Workspaces, w)
	}
	for _, s := range memSessions {
		state.Sessions = append(state.Sessions, s)
	}
	for _, t := range memTransfers {
		state.Transfers = append(state.Transfers, t)
	}

	if data, err := json.Marshal(state); err == nil {
		_ = os.WriteFile(cachePath, data, 0644)
	}
}

func ensureMemSessions() {
	memSessionOnce.Do(func() {
		loadMemSessionCache()
	})
}

// HashToken computes the SHA-256 hex string of a raw token.
func HashToken(rawToken string) string {
	h := sha256.Sum256([]byte(rawToken))
	return hex.EncodeToString(h[:])
}

// SessionRepository handles all persistence for workspaces, sessions, and transfers.
type SessionRepository struct {
	pool *pgxpool.Pool
}

// NewSessionRepository creates a new SessionRepository.
func NewSessionRepository(pool *pgxpool.Pool) *SessionRepository {
	return &SessionRepository{pool: pool}
}

// ── Workspaces ───────────────────────────────────────────────────────────────

// CreateWorkspace creates a new workspace record.
func (r *SessionRepository) CreateWorkspace(ctx context.Context, ws *model.Workspace) error {
	if r.pool == nil {
		ensureMemSessions()
		memSessionMu.Lock()
		defer memSessionMu.Unlock()

		if ws.ID == uuid.Nil {
			ws.ID = uuid.New()
		}
		now := time.Now()
		ws.CreatedAt = now
		ws.UpdatedAt = now
		if ws.Status == "" {
			ws.Status = "active"
		}
		memWorkspaces[ws.ID] = ws
		saveMemSessionCache()
		return nil
	}

	query := `
		INSERT INTO workspaces (id, created_at, updated_at, status)
		VALUES ($1, NOW(), NOW(), $2)
		RETURNING created_at, updated_at`

	err := r.pool.QueryRow(ctx, query, ws.ID, ws.Status).Scan(&ws.CreatedAt, &ws.UpdatedAt)
	if err != nil {
		return fmt.Errorf("insert workspace: %w", err)
	}
	return nil
}

// GetWorkspaceByID retrieves a workspace by its UUID.
func (r *SessionRepository) GetWorkspaceByID(ctx context.Context, id uuid.UUID) (*model.Workspace, error) {
	if r.pool == nil {
		ensureMemSessions()
		memSessionMu.RLock()
		defer memSessionMu.RUnlock()

		if ws, ok := memWorkspaces[id]; ok {
			cp := *ws
			return &cp, nil
		}
		return nil, ErrNotFound
	}

	query := `
		SELECT id, created_at, updated_at, status
		FROM workspaces
		WHERE id = $1`

	ws := &model.Workspace{}
	err := r.pool.QueryRow(ctx, query, id).Scan(&ws.ID, &ws.CreatedAt, &ws.UpdatedAt, &ws.Status)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get workspace: %w", err)
	}
	return ws, nil
}

// GetWorkspace is an alias for GetWorkspaceByID.
func (r *SessionRepository) GetWorkspace(ctx context.Context, id uuid.UUID) (*model.Workspace, error) {
	return r.GetWorkspaceByID(ctx, id)
}

// ── Sessions ─────────────────────────────────────────────────────────────────

// CreateSession creates a new session record with its token hash.
func (r *SessionRepository) CreateSession(ctx context.Context, s *model.Session) error {
	if r.pool == nil {
		ensureMemSessions()
		memSessionMu.Lock()
		defer memSessionMu.Unlock()

		if s.ID == uuid.Nil {
			s.ID = uuid.New()
		}
		now := time.Now()
		s.CreatedAt = now
		s.LastSeenAt = now
		if s.Status == "" {
			s.Status = "active"
		}
		memSessions[s.TokenHash] = s
		saveMemSessionCache()
		return nil
	}

	query := `
		INSERT INTO sessions (id, workspace_id, token_hash, created_at, last_seen_at, expires_at, status)
		VALUES ($1, $2, $3, NOW(), NOW(), $4, $5)
		RETURNING created_at, last_seen_at`

	err := r.pool.QueryRow(ctx, query, s.ID, s.WorkspaceID, s.TokenHash, s.ExpiresAt, s.Status).
		Scan(&s.CreatedAt, &s.LastSeenAt)
	if err != nil {
		if isUniqueViolation(err) {
			return ErrConflict
		}
		return fmt.Errorf("insert session: %w", err)
	}
	return nil
}

// GetSessionByTokenHash retrieves an unrevoked session by its SHA-256 token hash.
func (r *SessionRepository) GetSessionByTokenHash(ctx context.Context, tokenHash string) (*model.Session, error) {
	if r.pool == nil {
		ensureMemSessions()
		memSessionMu.RLock()
		defer memSessionMu.RUnlock()

		if s, ok := memSessions[tokenHash]; ok && s.RevokedAt == nil {
			cp := *s
			return &cp, nil
		}
		return nil, ErrNotFound
	}

	query := `
		SELECT id, workspace_id, token_hash, created_at, last_seen_at, expires_at, revoked_at, status
		FROM sessions
		WHERE token_hash = $1 AND revoked_at IS NULL`

	s := &model.Session{}
	err := r.pool.QueryRow(ctx, query, tokenHash).Scan(
		&s.ID, &s.WorkspaceID, &s.TokenHash, &s.CreatedAt,
		&s.LastSeenAt, &s.ExpiresAt, &s.RevokedAt, &s.Status,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get session by token hash: %w", err)
	}
	return s, nil
}

// TouchSession updates the last_seen_at timestamp and extends expiration (rolling inactivity).
func (r *SessionRepository) TouchSession(ctx context.Context, id uuid.UUID, newExpiresAt time.Time) error {
	if r.pool == nil {
		ensureMemSessions()
		memSessionMu.Lock()
		defer memSessionMu.Unlock()

		for _, s := range memSessions {
			if s.ID == id {
				s.LastSeenAt = time.Now()
				s.ExpiresAt = newExpiresAt
				saveMemSessionCache()
				return nil
			}
		}
		return ErrNotFound
	}

	query := `
		UPDATE sessions
		SET last_seen_at = NOW(), expires_at = $2
		WHERE id = $1 AND revoked_at IS NULL`

	_, err := r.pool.Exec(ctx, query, id, newExpiresAt)
	if err != nil {
		return fmt.Errorf("touch session: %w", err)
	}
	return nil
}

// RevokeSession marks a session as revoked by its UUID.
func (r *SessionRepository) RevokeSession(ctx context.Context, id uuid.UUID) error {
	if r.pool == nil {
		ensureMemSessions()
		memSessionMu.Lock()
		defer memSessionMu.Unlock()

		for _, s := range memSessions {
			if s.ID == id {
				now := time.Now()
				s.RevokedAt = &now
				s.Status = "revoked"
				saveMemSessionCache()
				return nil
			}
		}
		return ErrNotFound
	}

	query := `
		UPDATE sessions
		SET revoked_at = NOW(), status = 'revoked'
		WHERE id = $1`

	_, err := r.pool.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("revoke session: %w", err)
	}
	return nil
}

// RevokeSessionByTokenHash marks a session as revoked by its token hash.
func (r *SessionRepository) RevokeSessionByTokenHash(ctx context.Context, tokenHash string) error {
	if r.pool == nil {
		ensureMemSessions()
		memSessionMu.Lock()
		defer memSessionMu.Unlock()
		if s, ok := memSessions[tokenHash]; ok {
			now := time.Now()
			s.RevokedAt = &now
			s.Status = "revoked"
			saveMemSessionCache()
			return nil
		}
		return ErrNotFound
	}

	query := `
		UPDATE sessions
		SET revoked_at = NOW(), status = 'revoked'
		WHERE token_hash = $1`

	_, err := r.pool.Exec(ctx, query, tokenHash)
	if err != nil {
		return fmt.Errorf("revoke session by token hash: %w", err)
	}
	return nil
}

// ── Session Transfers ────────────────────────────────────────────────────────

// CreateTransfer creates a single-use transfer token record.
func (r *SessionRepository) CreateTransfer(ctx context.Context, t *model.SessionTransfer) error {
	if r.pool == nil {
		ensureMemSessions()
		memSessionMu.Lock()
		defer memSessionMu.Unlock()

		if t.ID == uuid.Nil {
			t.ID = uuid.New()
		}
		t.CreatedAt = time.Now()
		memTransfers[t.TokenHash] = t
		saveMemSessionCache()
		return nil
	}

	query := `
		INSERT INTO session_transfers (id, workspace_id, token_hash, created_at, expires_at)
		VALUES ($1, $2, $3, NOW(), $4)
		RETURNING created_at`

	err := r.pool.QueryRow(ctx, query, t.ID, t.WorkspaceID, t.TokenHash, t.ExpiresAt).Scan(&t.CreatedAt)
	if err != nil {
		return fmt.Errorf("insert session transfer: %w", err)
	}
	return nil
}

// GetTransferByTokenHash retrieves a transfer record by its token hash.
func (r *SessionRepository) GetTransferByTokenHash(ctx context.Context, tokenHash string) (*model.SessionTransfer, error) {
	if r.pool == nil {
		ensureMemSessions()
		memSessionMu.RLock()
		defer memSessionMu.RUnlock()

		if t, ok := memTransfers[tokenHash]; ok {
			cp := *t
			return &cp, nil
		}
		return nil, ErrNotFound
	}

	query := `
		SELECT id, workspace_id, token_hash, created_at, expires_at, used_at, revoked_at
		FROM session_transfers
		WHERE token_hash = $1`

	t := &model.SessionTransfer{}
	err := r.pool.QueryRow(ctx, query, tokenHash).Scan(
		&t.ID, &t.WorkspaceID, &t.TokenHash, &t.CreatedAt,
		&t.ExpiresAt, &t.UsedAt, &t.RevokedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get transfer by hash: %w", err)
	}
	return t, nil
}

// ClaimTransfer marks a transfer token as used.
func (r *SessionRepository) ClaimTransfer(ctx context.Context, id uuid.UUID) error {
	if r.pool == nil {
		ensureMemSessions()
		memSessionMu.Lock()
		defer memSessionMu.Unlock()

		for _, t := range memTransfers {
			if t.ID == id {
				if t.UsedAt != nil {
					return errors.New("transfer token already used")
				}
				now := time.Now()
				t.UsedAt = &now
				saveMemSessionCache()
				return nil
			}
		}
		return ErrNotFound
	}

	query := `
		UPDATE session_transfers
		SET used_at = NOW()
		WHERE id = $1 AND used_at IS NULL`

	res, err := r.pool.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("claim transfer: %w", err)
	}
	if res.RowsAffected() == 0 {
		return errors.New("transfer token already used or not found")
	}
	return nil
}

// MarkTransferUsed is an alias for ClaimTransfer.
func (r *SessionRepository) MarkTransferUsed(ctx context.Context, id uuid.UUID) error {
	return r.ClaimTransfer(ctx, id)
}
