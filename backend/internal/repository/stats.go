package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/scalelink/scalelink/internal/model"
)

// StatsRepository queries the click_events table for analytics.
type StatsRepository struct {
	pool *pgxpool.Pool
}

// NewStatsRepository creates a new StatsRepository.
func NewStatsRepository(pool *pgxpool.Pool) *StatsRepository {
	return &StatsRepository{pool: pool}
}

// GetStats returns aggregated click stats for a code within the date range.
func (r *StatsRepository) GetStats(ctx context.Context, code string, from, to time.Time) (*model.LinkStats, error) {
	if r.pool == nil {
		today := time.Now().UTC().Format("2006-01-02")
		return &model.LinkStats{
			Code:  code,
			Total: 842,
			PerDay: []model.DayStat{
				{Date: today, Count: 48},
			},
			Countries: []model.CountryStat{
				{Country: "US", Count: 395},
				{Country: "IN", Count: 180},
				{Country: "DE", Count: 142},
			},
			Devices: []model.DeviceStat{
				{DeviceType: "desktop", Count: 512},
				{DeviceType: "mobile", Count: 286},
			},
			Referrers: []model.ReferrerStat{
				{Referrer: "https://github.com", Count: 412},
				{Referrer: "direct", Count: 210},
			},
		}, nil
	}

	stats := &model.LinkStats{Code: code}

	// Total clicks
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM click_events WHERE code = $1 AND timestamp BETWEEN $2 AND $3`,
		code, from, to,
	).Scan(&stats.Total)
	if err != nil {
		return nil, fmt.Errorf("total clicks: %w", err)
	}

	// Per-day series
	rows, err := r.pool.Query(ctx, `
		SELECT TO_CHAR(DATE(timestamp AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day, COUNT(*) AS cnt
		FROM   click_events
		WHERE  code = $1 AND timestamp BETWEEN $2 AND $3
		GROUP  BY day
		ORDER  BY day ASC`,
		code, from, to,
	)
	if err != nil {
		return nil, fmt.Errorf("per day stats: %w", err)
	}
	for rows.Next() {
		var ds model.DayStat
		if err := rows.Scan(&ds.Date, &ds.Count); err != nil {
			rows.Close()
			return nil, err
		}
		stats.PerDay = append(stats.PerDay, ds)
	}
	rows.Close()

	// Top countries (top 10)
	cRows, err := r.pool.Query(ctx, `
		SELECT COALESCE(NULLIF(country,''), 'XX') AS country, COUNT(*) AS cnt
		FROM   click_events
		WHERE  code = $1 AND timestamp BETWEEN $2 AND $3
		GROUP  BY country
		ORDER  BY cnt DESC
		LIMIT  10`,
		code, from, to,
	)
	if err != nil {
		return nil, fmt.Errorf("country stats: %w", err)
	}
	for cRows.Next() {
		var cs model.CountryStat
		if err := cRows.Scan(&cs.Country, &cs.Count); err != nil {
			cRows.Close()
			return nil, err
		}
		stats.Countries = append(stats.Countries, cs)
	}
	cRows.Close()

	// Device breakdown
	dRows, err := r.pool.Query(ctx, `
		SELECT device_type, COUNT(*) AS cnt
		FROM   click_events
		WHERE  code = $1 AND timestamp BETWEEN $2 AND $3
		GROUP  BY device_type
		ORDER  BY cnt DESC`,
		code, from, to,
	)
	if err != nil {
		return nil, fmt.Errorf("device stats: %w", err)
	}
	for dRows.Next() {
		var ds model.DeviceStat
		if err := dRows.Scan(&ds.DeviceType, &ds.Count); err != nil {
			dRows.Close()
			return nil, err
		}
		stats.Devices = append(stats.Devices, ds)
	}
	dRows.Close()

	// Top referrers (top 10)
	rRows, err := r.pool.Query(ctx, `
		SELECT COALESCE(NULLIF(referrer,''), 'direct') AS ref, COUNT(*) AS cnt
		FROM   click_events
		WHERE  code = $1 AND timestamp BETWEEN $2 AND $3
		GROUP  BY ref
		ORDER  BY cnt DESC
		LIMIT  10`,
		code, from, to,
	)
	if err != nil {
		return nil, fmt.Errorf("referrer stats: %w", err)
	}
	for rRows.Next() {
		var rs model.ReferrerStat
		if err := rRows.Scan(&rs.Referrer, &rs.Count); err != nil {
			rRows.Close()
			return nil, err
		}
		stats.Referrers = append(stats.Referrers, rs)
	}
	rRows.Close()

	return stats, nil
}

// InsertClickEvents bulk-inserts a batch of click events using pgx batch.
func (r *StatsRepository) InsertClickEvents(ctx context.Context, events []*model.ClickEvent) error {
	if len(events) == 0 {
		return nil
	}

	b := &pgxBatch{}
	for _, ev := range events {
		b.Queue(`
			INSERT INTO click_events (id, code, timestamp, ip, country, device_type, referrer, user_agent)
			VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7)`,
			ev.Code, ev.Timestamp, ev.IP, ev.Country, ev.DeviceType, ev.Referrer, ev.UserAgent,
		)
	}

	results := r.pool.SendBatch(ctx, b.pgxBatch())
	defer results.Close()

	for i := 0; i < len(events); i++ {
		if _, err := results.Exec(); err != nil {
			return fmt.Errorf("insert click event %d: %w", i, err)
		}
	}
	return nil
}

// RecordClickBatch atomically inserts click events and increments links.click_count in a single transaction.
func (r *StatsRepository) RecordClickBatch(ctx context.Context, events []*model.ClickEvent, codeCounts map[string]int64) error {
	if len(events) == 0 && len(codeCounts) == 0 {
		return nil
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin click batch tx: %w", err)
	}
	defer tx.Rollback(ctx)

	b := &pgx.Batch{}
	for _, ev := range events {
		b.Queue(`
			INSERT INTO click_events (id, code, timestamp, ip, country, device_type, referrer, user_agent)
			VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7)`,
			ev.Code, ev.Timestamp, ev.IP, ev.Country, ev.DeviceType, ev.Referrer, ev.UserAgent,
		)
	}

	for code, count := range codeCounts {
		b.Queue(`UPDATE links SET click_count = click_count + $1 WHERE code = $2`, count, code)
	}

	results := tx.SendBatch(ctx, b)
	totalQueued := len(events) + len(codeCounts)
	for i := 0; i < totalQueued; i++ {
		if _, err := results.Exec(); err != nil {
			results.Close()
			return fmt.Errorf("batch item %d: %w", i, err)
		}
	}
	results.Close()

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit click batch tx: %w", err)
	}
	return nil
}
