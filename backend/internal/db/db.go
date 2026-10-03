package db

import (
	"context"
	"embed"
	"fmt"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"

	"github.com/scalelink/scalelink/internal/config"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Pool is an alias for pgxpool.Pool for use in dependency injection.
type Pool = pgxpool.Pool

// Connect opens a pgxpool connection to PostgreSQL.
func Connect(ctx context.Context, cfg *config.Config) (*pgxpool.Pool, error) {
	dsn := fmt.Sprintf(
		"postgres://%s:%s@%s:%s/%s?sslmode=%s&pool_max_conns=%d&pool_min_conns=%d",
		cfg.PostgresUser, cfg.PostgresPassword,
		cfg.PostgresHost, cfg.PostgresPort,
		cfg.PostgresDB, cfg.PostgresSSLMode,
		cfg.PostgresMaxConns, cfg.PostgresMinConns,
	)

	poolCfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse postgres config: %w", err)
	}

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("create postgres pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("ping postgres: %w", err)
	}

	log.Info().Str("host", cfg.PostgresHost).Msg("postgres connected")
	return pool, nil
}

// RunMigrations applies any pending migrations using golang-migrate with iofs.
// Migrations are embedded from the /migrations directory at compile time.
// Safe to call on every startup — idempotent.
func RunMigrations(cfg *config.Config) error {
	dbURL := fmt.Sprintf(
		"postgres://%s:%s@%s:%s/%s?sslmode=%s",
		cfg.PostgresUser, cfg.PostgresPassword,
		cfg.PostgresHost, cfg.PostgresPort,
		cfg.PostgresDB, cfg.PostgresSSLMode,
	)

	src, err := iofs.New(migrationsFS, "migrations")
	if err != nil {
		return fmt.Errorf("create iofs migration source: %w", err)
	}

	m, err := migrate.NewWithSourceInstance("iofs", src, dbURL)
	if err != nil {
		return fmt.Errorf("create migrator: %w", err)
	}
	defer m.Close()

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("apply migrations: %w", err)
	}

	v, dirty, _ := m.Version()
	log.Info().Uint("schema_version", v).Bool("dirty", dirty).Msg("migrations complete")
	return nil
}
