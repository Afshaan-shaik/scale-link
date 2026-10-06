package repository

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/scalelink/scalelink/internal/model"
)

var (
	memUsersMu sync.RWMutex
	memUsers   = make(map[string]*model.User)
)

// UserRepository handles all Postgres operations for the users table.
type UserRepository struct {
	pool *pgxpool.Pool
}

// NewUserRepository creates a new UserRepository.
func NewUserRepository(pool *pgxpool.Pool) *UserRepository {
	return &UserRepository{pool: pool}
}

// Create inserts a new user. Returns ErrConflict if email is already taken.
func (r *UserRepository) Create(ctx context.Context, user *model.User) error {
	if r.pool == nil {
		memUsersMu.Lock()
		defer memUsersMu.Unlock()
		if _, exists := memUsers[user.Email]; exists {
			return ErrConflict
		}
		now := time.Now()
		user.CreatedAt = now
		user.UpdatedAt = now
		memUsers[user.Email] = user
		return nil
	}

	query := `
		INSERT INTO users (id, email, password_hash, created_at, updated_at)
		VALUES ($1, $2, $3, NOW(), NOW())
		RETURNING created_at, updated_at`

	err := r.pool.QueryRow(ctx, query,
		user.ID, user.Email, user.PasswordHash,
	).Scan(&user.CreatedAt, &user.UpdatedAt)

	if err != nil {
		if isUniqueViolation(err) {
			return ErrConflict
		}
		return fmt.Errorf("insert user: %w", err)
	}
	return nil
}

// GetByEmail fetches a non-deleted user by email.
func (r *UserRepository) GetByEmail(ctx context.Context, email string) (*model.User, error) {
	if r.pool == nil {
		memUsersMu.RLock()
		defer memUsersMu.RUnlock()
		if u, exists := memUsers[email]; exists && u.DeletedAt == nil {
			copy := *u
			return &copy, nil
		}
		return nil, ErrNotFound
	}

	query := `
		SELECT id, email, password_hash, created_at, updated_at
		FROM   users
		WHERE  email = $1 AND deleted_at IS NULL`

	user := &model.User{}
	err := r.pool.QueryRow(ctx, query, email).Scan(
		&user.ID, &user.Email, &user.PasswordHash,
		&user.CreatedAt, &user.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get user by email: %w", err)
	}
	return user, nil
}

// GetByID fetches a non-deleted user by UUID.
func (r *UserRepository) GetByID(ctx context.Context, id interface{}) (*model.User, error) {
	if r.pool == nil {
		memUsersMu.RLock()
		defer memUsersMu.RUnlock()
		for _, u := range memUsers {
			if u.DeletedAt == nil && fmt.Sprintf("%v", u.ID) == fmt.Sprintf("%v", id) {
				copy := *u
				return &copy, nil
			}
		}
		return nil, ErrNotFound
	}

	query := `
		SELECT id, email, password_hash, created_at, updated_at
		FROM   users
		WHERE  id = $1 AND deleted_at IS NULL`

	user := &model.User{}
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&user.ID, &user.Email, &user.PasswordHash,
		&user.CreatedAt, &user.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get user by id: %w", err)
	}
	return user, nil
}
