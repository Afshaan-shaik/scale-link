package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/joho/godotenv"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/scalelink/scalelink/internal/cache"
	"github.com/scalelink/scalelink/internal/config"
	"github.com/scalelink/scalelink/internal/db"
	"github.com/scalelink/scalelink/internal/handler"
	"github.com/scalelink/scalelink/internal/middleware"
	"github.com/scalelink/scalelink/internal/ratelimit"
	"github.com/scalelink/scalelink/internal/repository"
	"github.com/scalelink/scalelink/internal/service"
	"github.com/scalelink/scalelink/internal/stream"
)

func main() {
	// ── Load env ──────────────────────────────────────────────────────────────
	_ = godotenv.Load() // ignore error; env vars may be set by Docker

	// ── Config ────────────────────────────────────────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("load config")
	}

	// ── Logger ────────────────────────────────────────────────────────────────
	setupLogger(cfg)

	// ── Migrations ────────────────────────────────────────────────────────────
	log.Info().Msg("running database migrations")
	if err := db.RunMigrations(cfg); err != nil {
		log.Fatal().Err(err).Msg("run migrations")
	}

	// ── Postgres pool ─────────────────────────────────────────────────────────
	pool, err := db.Connect(context.Background(), cfg)
	if err != nil {
		log.Fatal().Err(err).Msg("connect to postgres")
	}
	defer pool.Close()

	// ── Redis ─────────────────────────────────────────────────────────────────
	var rdb *redis.Client
	if cfg.RedisAddr != "" {
		rdb = redis.NewClient(&redis.Options{
			Addr:       cfg.RedisAddr,
			Password:   cfg.RedisPassword,
			DB:         cfg.RedisDB,
			MaxRetries: cfg.RedisMaxRetries,
		})
		if err := rdb.Ping(context.Background()).Err(); err != nil {
			log.Warn().Err(err).Msg("redis unavailable — continuing with direct DB fallback")
			rdb = nil
		} else {
			log.Info().Str("addr", cfg.RedisAddr).Msg("redis connected")
			defer rdb.Close()
		}
	}

	// ── Cache, Rate Limiter & Streams Producer ────────────────────────────────
	linkCache := cache.NewLinkCache(rdb)
	limiter := ratelimit.NewTokenBucketLimiter(rdb)
	streamProducer := stream.NewProducer(rdb, cfg.StreamClickEvents)

	// ── Repositories ──────────────────────────────────────────────────────────
	linkRepo  := repository.NewLinkRepository(pool)
	userRepo  := repository.NewUserRepository(pool)
	keyRepo   := repository.NewAPIKeyRepository(pool)
	blockRepo := repository.NewBlocklistRepository(pool)
	statsRepo := repository.NewStatsRepository(pool)

	// ── Services ──────────────────────────────────────────────────────────────
	linkSvc, err := service.NewLinkService(cfg, linkRepo, blockRepo, linkCache)
	if err != nil {
		log.Fatal().Err(err).Msg("init link service")
	}
	authSvc  := service.NewAuthService(cfg, userRepo, keyRepo)
	statsSvc := service.NewStatsService(statsRepo)

	// ── Handlers ──────────────────────────────────────────────────────────────
	linkH   := handler.NewLinkHandler(linkSvc, statsSvc, linkCache, streamProducer, cfg.RedirectStatusCode, cfg.CacheLinkTTL, cfg.CacheNegativeTTL)
	authH   := handler.NewAuthHandler(authSvc)
	keyH    := handler.NewAPIKeyHandler(authSvc)
	healthH := handler.NewHealthHandler(pool, rdb)

	// ── Router ────────────────────────────────────────────────────────────────
	r := chi.NewRouter()

	// Global middleware
	r.Use(middleware.RealIP)
	r.Use(middleware.RequestID)
	r.Use(middleware.Logger)
	r.Use(middleware.Metrics)
	r.Use(middleware.Recoverer)
	r.Use(chiMiddleware.StripSlashes)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Request-ID"},
		ExposedHeaders:   []string{"X-Cache", "X-Served-By", "X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining", "Retry-After"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	// ── Public routes ─────────────────────────────────────────────────────────
	r.Get("/health", healthH.Health)
	r.Get("/metrics", promhttp.Handler().ServeHTTP)

	// Auth
	r.Route("/api/auth", func(r chi.Router) {
		r.Post("/register", authH.Register)
		r.Post("/login",    authH.Login)
		r.Post("/refresh",  authH.Refresh)
		r.With(middleware.AuthRequired(authSvc)).Get("/me", authH.Me)
	})

	// Links — creation is rate-limited and optionally authenticated
	r.Route("/api/links", func(r chi.Router) {
		r.With(middleware.RateLimit(limiter, "create", cfg.RateLimitCreatePerMin)).
			With(middleware.OptionalAuth(authSvc)).
			Post("/", linkH.CreateLink)

		// Public/OptionalAuth stats (anonymous links accessible, owned links require owner auth)
		r.With(middleware.OptionalAuth(authSvc)).
			Get("/{code}/stats", linkH.GetStats)

		// Authenticated link management
		r.Group(func(r chi.Router) {
			r.Use(middleware.AuthRequired(authSvc))
			r.Get("/",        linkH.ListLinks)
			r.Get("/{code}",  linkH.GetLink)
			r.Patch("/{id}",  linkH.UpdateLink)
			r.Delete("/{id}", linkH.DeleteLink)
		})
	})

	// API Keys
	r.Route("/api/keys", func(r chi.Router) {
		r.Use(middleware.AuthRequired(authSvc))
		r.With(middleware.RateLimit(limiter, "create_key", cfg.RateLimitAPIKeyPerMin)).
			Post("/", keyH.CreateKey)
		r.Get("/",        keyH.ListKeys)
		r.Delete("/{id}", keyH.RevokeKey)
	})

	// ── Short-link redirect — hot path with rate limit ────────────────────────
	r.With(middleware.RateLimit(limiter, "redirect", cfg.RateLimitRedirectPerMin)).
		Get("/{code}", linkH.Redirect)

	// ── Server ────────────────────────────────────────────────────────────────
	srv := &http.Server{
		Addr:         ":" + cfg.ServerPort,
		Handler:      r,
		ReadTimeout:  cfg.ServerReadTimeout,
		WriteTimeout: cfg.ServerWriteTimeout,
		IdleTimeout:  cfg.ServerIdleTimeout,
	}

	// Start in a goroutine so we can listen for shutdown signals.
	serverErr := make(chan error, 1)
	go func() {
		log.Info().Str("addr", srv.Addr).Str("env", cfg.Environment).Msg("server starting")
		serverErr <- srv.ListenAndServe()
	}()

	// ── Graceful shutdown ─────────────────────────────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-serverErr:
		log.Fatal().Err(err).Msg("server error")
	case sig := <-quit:
		log.Info().Str("signal", sig.String()).Msg("shutdown signal received")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Error().Err(err).Msg("graceful shutdown failed")
	} else {
		log.Info().Msg("server shut down cleanly")
	}
}

func setupLogger(cfg *config.Config) {
	level, err := zerolog.ParseLevel(cfg.LogLevel)
	if err != nil {
		level = zerolog.InfoLevel
	}
	zerolog.SetGlobalLevel(level)

	if !cfg.IsProduction() {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339})
	}
}
