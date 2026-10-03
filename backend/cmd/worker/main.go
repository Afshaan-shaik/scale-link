package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/scalelink/scalelink/internal/config"
	"github.com/scalelink/scalelink/internal/db"
	"github.com/scalelink/scalelink/internal/repository"
	"github.com/scalelink/scalelink/internal/stream"
)

func main() {
	// Configure structured logger
	zerolog.TimeFieldFormat = time.RFC3339Nano
	if os.Getenv("ENVIRONMENT") != "production" {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: "15:04:05.000"})
	}

	log.Info().Msg("starting ScaleLink click worker service")

	// ── Configuration ─────────────────────────────────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("failed to load configuration")
	}

	// ── Database Connection ───────────────────────────────────────────────────
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pool, err := db.Connect(ctx, cfg)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to PostgreSQL")
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatal().Err(err).Msg("failed to ping PostgreSQL")
	}
	log.Info().Msg("connected to PostgreSQL successfully")

	// ── Redis Connection ──────────────────────────────────────────────────────
	rdb := redis.NewClient(&redis.Options{
		Addr:         cfg.RedisAddr,
		Password:     cfg.RedisPassword,
		DB:           cfg.RedisDB,
		MaxRetries:   cfg.RedisMaxRetries,
		DialTimeout:  5 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
	})
	defer rdb.Close()

	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Fatal().Err(err).Msg("failed to ping Redis")
	}
	log.Info().Msg("connected to Redis successfully")

	// ── Optional Worker Metrics & Health HTTP Server ──────────────────────────
	metricsMux := http.NewServeMux()
	metricsMux.Handle("/metrics", promhttp.Handler())
	metricsMux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok","service":"worker"}`))
	})
	metricsPort := os.Getenv("WORKER_METRICS_PORT")
	if metricsPort == "" {
		metricsPort = "8082"
	}
	metricsServer := &http.Server{
		Addr:         ":" + metricsPort,
		Handler:      metricsMux,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 5 * time.Second,
	}
	go func() {
		log.Info().Str("port", metricsPort).Msg("worker internal metrics server listening")
		if err := metricsServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Warn().Err(err).Msg("worker metrics server stopped")
		}
	}()

	// ── Repositories & Consumer ───────────────────────────────────────────────
	statsRepo := repository.NewStatsRepository(pool)

	hostname, _ := os.Hostname()
	if hostname == "" {
		hostname = "worker"
	}
	consumerName := fmt.Sprintf("%s-%d", hostname, os.Getpid())

	consumer := stream.NewConsumer(rdb, statsRepo, stream.ConsumerConfig{
		StreamName:     cfg.StreamClickEvents,
		DeadLetterName: cfg.StreamDeadLetter,
		GroupName:      cfg.ConsumerGroup,
		ConsumerName:   consumerName,
		BatchSize:      cfg.WorkerBatchSize,
		BlockMs:        time.Duration(cfg.WorkerBlockMs) * time.Millisecond,
		MaxRetries:     cfg.WorkerMaxRetries,
	})

	// ── Graceful Shutdown Signal Handling ─────────────────────────────────────
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)

	go func() {
		sig := <-sigCh
		log.Info().Str("signal", sig.String()).Msg("shutdown signal received; stopping consumer...")
		cancel()

		shutdownCtx, sCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer sCancel()
		_ = metricsServer.Shutdown(shutdownCtx)
	}()

	// ── Start Consumer Loop ───────────────────────────────────────────────────
	if err := consumer.Run(ctx); err != nil {
		log.Error().Err(err).Msg("consumer exited with error")
		os.Exit(1)
	}

	log.Info().Msg("worker stopped gracefully")
}
