package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"sync"

	"github.com/scalelink/scalelink/internal/model"
)

var (
	memLinksOnce sync.Once
	memLinks     = make(map[string]*model.Link)
	memLinksMu   sync.RWMutex
)

func ensureMemLinks() {
	memLinksOnce.Do(func() {
		now := time.Now()
		memLinks["gh-repo"] = &model.Link{
			ID:         uuid.MustParse("9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"),
			Code:       "gh-repo",
			LongURL:    "https://github.com/Afshaan-shaik/scale-link",
			ClickCount: 842,
			CreatedAt:  now.Add(-5 * 24 * time.Hour),
			UpdatedAt:  now.Add(-5 * 24 * time.Hour),
			IsCustom:   true,
		}
	})
}

// ErrNotFound is returned when a requested resource does not exist or is deleted.
var ErrNotFound = errors.New("not found")

// ErrConflict is returned when a unique constraint is violated.
var ErrConflict = errors.New("conflict: resource already exists")

// LinkRepository handles all Postgres operations for the links table.
type LinkRepository struct {
	pool *pgxpool.Pool
}

// NewLinkRepository creates a new LinkRepository.
func NewLinkRepository(pool *pgxpool.Pool) *LinkRepository {
	return &LinkRepository{pool: pool}
}

// Create inserts a new link. Returns ErrConflict if the code is already taken.
func (r *LinkRepository) Create(ctx context.Context, link *model.Link) error {
	if r.pool == nil {
		ensureMemLinks()
		memLinksMu.Lock()
		defer memLinksMu.Unlock()
		if _, exists := memLinks[link.Code]; exists {
			return ErrConflict
		}
		link.CreatedAt = time.Now()
		link.UpdatedAt = time.Now()
		memLinks[link.Code] = link
		return nil
	}

	query := `
		INSERT INTO links (id, code, long_url, user_id, expires_at, is_custom, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
		RETURNING created_at, updated_at`

	err := r.pool.QueryRow(ctx, query,
		link.ID, link.Code, link.LongURL, link.UserID, link.ExpiresAt, link.IsCustom,
	).Scan(&link.CreatedAt, &link.UpdatedAt)

	if err != nil {
		if isUniqueViolation(err) {
			return ErrConflict
		}
		return fmt.Errorf("insert link: %w", err)
	}
	return nil
}

// GetByCode fetches a live (non-deleted) link by its short code.
// Returns ErrNotFound if no such link exists or it has been soft-deleted.
func (r *LinkRepository) GetByCode(ctx context.Context, code string) (*model.Link, error) {
	if r.pool == nil {
		ensureMemLinks()
		memLinksMu.RLock()
		defer memLinksMu.RUnlock()
		if l, exists := memLinks[code]; exists && l.DeletedAt == nil {
			copy := *l
			return &copy, nil
		}
		return nil, ErrNotFound
	}

	query := `
		SELECT id, code, long_url, user_id, expires_at, created_at, updated_at, deleted_at, click_count, is_custom
		FROM   links
		WHERE  code = $1
		AND    deleted_at IS NULL`

	link := &model.Link{}
	err := r.pool.QueryRow(ctx, query, code).Scan(
		&link.ID, &link.Code, &link.LongURL, &link.UserID,
		&link.ExpiresAt, &link.CreatedAt, &link.UpdatedAt,
		&link.DeletedAt, &link.ClickCount, &link.IsCustom,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get link by code: %w", err)
	}
	return link, nil
}

// GetByID fetches a link by its UUID, including soft-deleted.
func (r *LinkRepository) GetByID(ctx context.Context, id uuid.UUID, userID uuid.UUID) (*model.Link, error) {
	query := `
		SELECT id, code, long_url, user_id, expires_at, created_at, updated_at, deleted_at, click_count, is_custom
		FROM   links
		WHERE  id = $1 AND user_id = $2`

	link := &model.Link{}
	err := r.pool.QueryRow(ctx, query, id, userID).Scan(
		&link.ID, &link.Code, &link.LongURL, &link.UserID,
		&link.ExpiresAt, &link.CreatedAt, &link.UpdatedAt,
		&link.DeletedAt, &link.ClickCount, &link.IsCustom,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get link by id: %w", err)
	}
	return link, nil
}

// ListByUser returns paginated links for a user, newest first.
func (r *LinkRepository) ListByUser(ctx context.Context, userID uuid.UUID, limit, offset int, search string) ([]*model.Link, int, error) {
	baseWhere := `WHERE user_id = $1 AND deleted_at IS NULL`
	args := []any{userID}
	argIdx := 2

	if search != "" {
		baseWhere += fmt.Sprintf(` AND (long_url ILIKE $%d OR code ILIKE $%d)`, argIdx, argIdx+1)
		pattern := "%" + search + "%"
		args = append(args, pattern, pattern)
		argIdx += 2
	}

	countQuery := `SELECT COUNT(*) FROM links ` + baseWhere
	var total int
	if err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count links: %w", err)
	}

	listQuery := fmt.Sprintf(`
		SELECT id, code, long_url, user_id, expires_at, created_at, updated_at, deleted_at, click_count, is_custom
		FROM   links
		%s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d`, baseWhere, argIdx, argIdx+1)
	args = append(args, limit, offset)

	rows, err := r.pool.Query(ctx, listQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list links: %w", err)
	}
	defer rows.Close()

	var links []*model.Link
	for rows.Next() {
		link := &model.Link{}
		if err := rows.Scan(
			&link.ID, &link.Code, &link.LongURL, &link.UserID,
			&link.ExpiresAt, &link.CreatedAt, &link.UpdatedAt,
			&link.DeletedAt, &link.ClickCount, &link.IsCustom,
		); err != nil {
			return nil, 0, fmt.Errorf("scan link row: %w", err)
		}
		links = append(links, link)
	}
	return links, total, nil
}

// UpdateExpiry allows changing the expiry time of a link.
// Returns ErrNotFound if the link doesn't belong to the user.
func (r *LinkRepository) UpdateExpiry(ctx context.Context, id uuid.UUID, userID uuid.UUID, expiresAt *time.Time) (string, error) {
	query := `
		UPDATE links SET expires_at = $1, updated_at = NOW()
		WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
		RETURNING code`

	var code string
	err := r.pool.QueryRow(ctx, query, expiresAt, id, userID).Scan(&code)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("update expiry: %w", err)
	}
	return code, nil
}

// SoftDelete marks a link as deleted and returns its short code.
func (r *LinkRepository) SoftDelete(ctx context.Context, id uuid.UUID, userID uuid.UUID) (string, error) {
	query := `
		UPDATE links SET deleted_at = NOW(), updated_at = NOW()
		WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
		RETURNING code`

	var code string
	err := r.pool.QueryRow(ctx, query, id, userID).Scan(&code)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("soft delete link: %w", err)
	}
	return code, nil
}

// IncrementClickCount atomically increments a link's click counter.
func (r *LinkRepository) IncrementClickCount(ctx context.Context, code string, n int64) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE links SET click_count = click_count + $1 WHERE code = $2`,
		n, code,
	)
	return err
}

// CodeExists reports whether a code is already taken (including deleted links).
func (r *LinkRepository) CodeExists(ctx context.Context, code string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM links WHERE code = $1)`, code,
	).Scan(&exists)
	return exists, err
}

// isUniqueViolation checks whether the error is a Postgres unique constraint violation (23505).
func isUniqueViolation(err error) bool {
	return err != nil && (containsStr(err.Error(), "23505") || containsStr(err.Error(), "unique"))
}

func containsStr(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(s) > 0 && containsStrRec(s, sub))
}

func containsStrRec(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
