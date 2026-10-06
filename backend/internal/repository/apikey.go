package repository

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/scalelink/scalelink/internal/model"
)

var (
	memKeysMu sync.RWMutex
	memKeys   = make(map[string]*model.APIKey)
)

// APIKeyRepository handles all Postgres operations for the api_keys table.
type APIKeyRepository struct {
	pool *pgxpool.Pool
}

// NewAPIKeyRepository creates a new APIKeyRepository.
func NewAPIKeyRepository(pool *pgxpool.Pool) *APIKeyRepository {
	return &APIKeyRepository{pool: pool}
}

// Create inserts a new API key (only the hash is stored).
func (r *APIKeyRepository) Create(ctx context.Context, key *model.APIKey) error {
	if r.pool == nil {
		memKeysMu.Lock()
		defer memKeysMu.Unlock()
		now := time.Now()
		key.CreatedAt = now
		memKeys[key.KeyHash] = key
		return nil
	}

	query := `
		INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, created_at)
		VALUES ($1, $2, $3, $4, $5, NOW())
		RETURNING created_at`

	err := r.pool.QueryRow(ctx, query,
		key.ID, key.UserID, key.Name, key.KeyHash, key.KeyPrefix,
	).Scan(&key.CreatedAt)

	if err != nil {
		return fmt.Errorf("insert api key: %w", err)
	}
	return nil
}

// GetByHash fetches an active API key by its hash.
func (r *APIKeyRepository) GetByHash(ctx context.Context, hash string) (*model.APIKey, error) {
	if r.pool == nil {
		memKeysMu.RLock()
		defer memKeysMu.RUnlock()
		if k, ok := memKeys[hash]; ok && k.RevokedAt == nil {
			copy := *k
			return &copy, nil
		}
		return nil, ErrNotFound
	}

	query := `
		SELECT id, user_id, name, key_hash, key_prefix, created_at, last_used, revoked_at
		FROM   api_keys
		WHERE  key_hash = $1 AND revoked_at IS NULL`

	key := &model.APIKey{}
	err := r.pool.QueryRow(ctx, query, hash).Scan(
		&key.ID, &key.UserID, &key.Name, &key.KeyHash, &key.KeyPrefix,
		&key.CreatedAt, &key.LastUsed, &key.RevokedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get api key by hash: %w", err)
	}
	return key, nil
}

// ListByUser returns all active API keys for a user.
func (r *APIKeyRepository) ListByUser(ctx context.Context, userID uuid.UUID) ([]*model.APIKey, error) {
	if r.pool == nil {
		memKeysMu.RLock()
		defer memKeysMu.RUnlock()
		var res []*model.APIKey
		for _, k := range memKeys {
			if k.UserID == userID && k.RevokedAt == nil {
				copy := *k
				res = append(res, &copy)
			}
		}
		return res, nil
	}

	query := `
		SELECT id, user_id, name, key_hash, key_prefix, created_at, last_used, revoked_at
		FROM   api_keys
		WHERE  user_id = $1 AND revoked_at IS NULL
		ORDER BY created_at DESC`

	rows, err := r.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("list api keys: %w", err)
	}
	defer rows.Close()

	var keys []*model.APIKey
	for rows.Next() {
		key := &model.APIKey{}
		if err := rows.Scan(
			&key.ID, &key.UserID, &key.Name, &key.KeyHash, &key.KeyPrefix,
			&key.CreatedAt, &key.LastUsed, &key.RevokedAt,
		); err != nil {
			return nil, fmt.Errorf("scan api key row: %w", err)
		}
		keys = append(keys, key)
	}
	return keys, nil
}

// Revoke soft-deletes an API key.
func (r *APIKeyRepository) Revoke(ctx context.Context, id uuid.UUID, userID uuid.UUID) error {
	if r.pool == nil {
		memKeysMu.Lock()
		defer memKeysMu.Unlock()
		for _, k := range memKeys {
			if k.ID == id && k.UserID == userID && k.RevokedAt == nil {
				now := time.Now()
				k.RevokedAt = &now
				return nil
			}
		}
		return ErrNotFound
	}

	query := `
		UPDATE api_keys SET revoked_at = NOW()
		WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`

	tag, err := r.pool.Exec(ctx, query, id, userID)
	if err != nil {
		return fmt.Errorf("revoke api key: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// TouchLastUsed updates the last_used timestamp for an API key.
func (r *APIKeyRepository) TouchLastUsed(ctx context.Context, id uuid.UUID) {
	if r.pool == nil {
		memKeysMu.Lock()
		defer memKeysMu.Unlock()
		for _, k := range memKeys {
			if k.ID == id {
				now := time.Now()
				k.LastUsed = &now
				return
			}
		}
		return
	}
	// Fire-and-forget: we don't want to block on this.
	_, _ = r.pool.Exec(ctx,
		`UPDATE api_keys SET last_used = NOW() WHERE id = $1`, id)
}
