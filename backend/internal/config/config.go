package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds all application configuration loaded from environment variables.
type Config struct {
	// Server
	BaseURL            string
	ServerPort         string
	ServerReadTimeout  time.Duration
	ServerWriteTimeout time.Duration
	ServerIdleTimeout  time.Duration
	Environment        string

	// Postgres
	PostgresHost     string
	PostgresPort     string
	PostgresUser     string
	PostgresPassword string
	PostgresDB       string
	PostgresSSLMode  string
	PostgresMaxConns int32
	PostgresMinConns int32

	// Redis
	RedisAddr       string
	RedisPassword   string
	RedisDB         int
	RedisMaxRetries int

	// Cache
	CacheLinkTTL     time.Duration
	CacheNegativeTTL time.Duration

	// Rate Limiting
	RateLimitCreatePerMin   int
	RateLimitRedirectPerMin int
	RateLimitAPIKeyPerMin   int

	// Auth
	JWTSecret     string
	JWTAccessTTL  time.Duration
	JWTRefreshTTL time.Duration

	// Short codes
	ShortCodeLength    int
	RedirectStatusCode int

	// Redis Streams
	StreamClickEvents string
	StreamDeadLetter  string
	ConsumerGroup     string
	WorkerBatchSize   int64
	WorkerBlockMs     int64
	WorkerMaxRetries  int

	// Observability
	MetricsEnabled bool
	LogLevel       string

	// Seed
	SeedUserEmail    string
	SeedUserPassword string
}

// Load reads configuration from environment variables with sensible defaults.
func Load() (*Config, error) {
	cfg := &Config{
		BaseURL:            getBaseURL(),
		ServerPort:         getEnv("PORT", getEnv("SERVER_PORT", "8080")),
		ServerReadTimeout:  getDuration("SERVER_READ_TIMEOUT", 10*time.Second),
		ServerWriteTimeout: getDuration("SERVER_WRITE_TIMEOUT", 10*time.Second),
		ServerIdleTimeout:  getDuration("SERVER_IDLE_TIMEOUT", 120*time.Second),
		Environment:        getEnv("ENVIRONMENT", "development"),

		PostgresHost:     getEnv("POSTGRES_HOST", "localhost"),
		PostgresPort:     getEnv("POSTGRES_PORT", "5432"),
		PostgresUser:     getEnv("POSTGRES_USER", "scalelink"),
		PostgresPassword: getEnv("POSTGRES_PASSWORD", ""),
		PostgresDB:       getEnv("POSTGRES_DB", "scalelink"),
		PostgresSSLMode:  getEnv("POSTGRES_SSLMODE", "disable"),
		PostgresMaxConns: int32(getInt("POSTGRES_MAX_CONNS", 25)),
		PostgresMinConns: int32(getInt("POSTGRES_MIN_CONNS", 5)),

		RedisAddr:       getEnv("REDIS_ADDR", "localhost:6379"),
		RedisPassword:   getEnv("REDIS_PASSWORD", ""),
		RedisDB:         getInt("REDIS_DB", 0),
		RedisMaxRetries: getInt("REDIS_MAX_RETRIES", 3),

		CacheLinkTTL:     getDuration("CACHE_LINK_TTL", time.Hour),
		CacheNegativeTTL: getDuration("CACHE_NEGATIVE_TTL", 5*time.Minute),

		RateLimitCreatePerMin:   getInt("RATE_LIMIT_CREATE_PER_MIN", 20),
		RateLimitRedirectPerMin: getInt("RATE_LIMIT_REDIRECT_PER_MIN", 200),
		RateLimitAPIKeyPerMin:   getInt("RATE_LIMIT_API_KEY_CREATE_PER_MIN", 60),

		JWTSecret:     getEnv("JWT_SECRET", "dev_secret_change_me"),
		JWTAccessTTL:  getDuration("JWT_ACCESS_TTL", 15*time.Minute),
		JWTRefreshTTL: getDuration("JWT_REFRESH_TTL", 7*24*time.Hour),

		ShortCodeLength:    getInt("SHORT_CODE_LENGTH", 6),
		RedirectStatusCode: getInt("REDIRECT_STATUS_CODE", 302),

		StreamClickEvents: getEnv("STREAM_CLICK_EVENTS", "clicks:events"),
		StreamDeadLetter:  getEnv("STREAM_DEAD_LETTER", "clicks:dead_letter"),
		ConsumerGroup:     getEnv("CONSUMER_GROUP", "click_workers"),
		WorkerBatchSize:   int64(getInt("WORKER_BATCH_SIZE", 100)),
		WorkerBlockMs:     int64(getInt("WORKER_BLOCK_MS", 2000)),
		WorkerMaxRetries:  getInt("WORKER_MAX_RETRIES", 3),

		MetricsEnabled: getBool("METRICS_ENABLED", true),
		LogLevel:       getEnv("LOG_LEVEL", "info"),

		SeedUserEmail:    getEnv("SEED_USER_EMAIL", "demo@scalelink.dev"),
		SeedUserPassword: getEnv("SEED_USER_PASSWORD", "Demo1234!"),
	}

	// ── Support cloud connection strings (Neon, Supabase, Vercel Postgres) ────
	if dbURL := getEnv("DATABASE_URL", getEnv("POSTGRES_URL", "")); dbURL != "" {
		if parsed, err := url.Parse(dbURL); err == nil {
			if h := parsed.Hostname(); h != "" {
				cfg.PostgresHost = h
			}
			if p := parsed.Port(); p != "" {
				cfg.PostgresPort = p
			}
			if parsed.User != nil {
				cfg.PostgresUser = parsed.User.Username()
				if pass, ok := parsed.User.Password(); ok {
					cfg.PostgresPassword = pass
				}
			}
			if path := strings.TrimPrefix(parsed.Path, "/"); path != "" {
				cfg.PostgresDB = path
			}
			if q := parsed.Query().Get("sslmode"); q != "" {
				cfg.PostgresSSLMode = q
			}
		}
	}

	// ── Support cloud Redis URLs (Upstash, Redis Cloud) ───────────────────────
	if redisURL := getEnv("REDIS_URL", ""); redisURL != "" {
		if parsed, err := url.Parse(redisURL); err == nil {
			if parsed.Host != "" {
				cfg.RedisAddr = parsed.Host
			}
			if parsed.User != nil {
				if pass, ok := parsed.User.Password(); ok {
					cfg.RedisPassword = pass
				}
			}
		}
	}

	if err := cfg.validate(); err != nil {
		return nil, err
	}
	return cfg, nil
}

func getBaseURL() string {
	if b := os.Getenv("BASE_URL"); b != "" {
		return b
	}
	if v := os.Getenv("VERCEL_URL"); v != "" {
		if !strings.HasPrefix(v, "http://") && !strings.HasPrefix(v, "https://") {
			return "https://" + v
		}
		return v
	}
	return "http://localhost:8080"
}

func (c *Config) validate() error {
	if c.JWTSecret == "" {
		return fmt.Errorf("JWT_SECRET must not be empty")
	}
	if c.PostgresPassword == "" && c.Environment != "development" {
		return fmt.Errorf("POSTGRES_PASSWORD must be set in non-development environments")
	}
	return nil
}

// DSN returns the PostgreSQL connection string.
func (c *Config) DSN() string {
	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s pool_max_conns=%d pool_min_conns=%d",
		c.PostgresHost, c.PostgresPort, c.PostgresUser, c.PostgresPassword,
		c.PostgresDB, c.PostgresSSLMode, c.PostgresMaxConns, c.PostgresMinConns,
	)
}

// IsProduction returns true when running in production mode.
func (c *Config) IsProduction() bool {
	return strings.EqualFold(c.Environment, "production")
}

// ── helpers ──────────────────────────────────────────────────────────────────

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}

func getBool(key string, fallback bool) bool {
	if v := os.Getenv(key); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return fallback
}

func getDuration(key string, fallback time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}
