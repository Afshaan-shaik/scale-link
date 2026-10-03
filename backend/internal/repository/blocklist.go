package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/scalelink/scalelink/internal/model"
)

// BlocklistRepository manages the blocked_domains table.
type BlocklistRepository struct {
	pool *pgxpool.Pool
}

// NewBlocklistRepository creates a new BlocklistRepository.
func NewBlocklistRepository(pool *pgxpool.Pool) *BlocklistRepository {
	return &BlocklistRepository{pool: pool}
}

// LoadAll returns all blocked domains as a set for fast in-memory lookup.
func (r *BlocklistRepository) LoadAll(ctx context.Context) (map[string]struct{}, error) {
	rows, err := r.pool.Query(ctx, `SELECT domain FROM blocked_domains`)
	if err != nil {
		return nil, fmt.Errorf("load blocked domains: %w", err)
	}
	defer rows.Close()

	out := make(map[string]struct{})
	for rows.Next() {
		var domain string
		if err := rows.Scan(&domain); err != nil {
			return nil, err
		}
		out[domain] = struct{}{}
	}
	return out, nil
}

// List returns all blocked domains with metadata.
func (r *BlocklistRepository) List(ctx context.Context) ([]*model.BlockedDomain, error) {
	rows, err := r.pool.Query(ctx, `SELECT id, domain, reason, created_at FROM blocked_domains ORDER BY created_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("list blocked domains: %w", err)
	}
	defer rows.Close()

	var out []*model.BlockedDomain
	for rows.Next() {
		d := &model.BlockedDomain{}
		if err := rows.Scan(&d.ID, &d.Domain, &d.Reason, &d.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, nil
}

// Add inserts a new blocked domain.
func (r *BlocklistRepository) Add(ctx context.Context, domain, reason string) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO blocked_domains (domain, reason) VALUES ($1, $2) ON CONFLICT (domain) DO NOTHING`,
		domain, reason,
	)
	return err
}

// Remove deletes a blocked domain.
func (r *BlocklistRepository) Remove(ctx context.Context, domain string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM blocked_domains WHERE domain = $1`, domain)
	return err
}
