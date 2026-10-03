package main

import (
	"context"
	"fmt"
	"math/rand"
	"time"

	"github.com/google/uuid"
	"github.com/joho/godotenv"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"golang.org/x/crypto/bcrypt"

	"github.com/scalelink/scalelink/internal/config"
	"github.com/scalelink/scalelink/internal/db"
	"github.com/scalelink/scalelink/internal/model"
	"github.com/scalelink/scalelink/internal/repository"
)

func main() {
	_ = godotenv.Load()

	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("load config")
	}

	log.Logger = log.Output(zerolog.NewConsoleWriter())

	log.Info().Msg("==> Running database migrations before seed...")
	if err := db.RunMigrations(cfg); err != nil {
		log.Fatal().Err(err).Msg("failed to run migrations")
	}

	ctx := context.Background()
	pool, err := db.Connect(ctx, cfg)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to database")
	}
	defer pool.Close()

	userRepo := repository.NewUserRepository(pool)
	linkRepo := repository.NewLinkRepository(pool)
	statsRepo := repository.NewStatsRepository(pool)

	// 1. Create or fetch demo user
	log.Info().Str("email", cfg.SeedUserEmail).Msg("==> Seeding demo user...")
	demoUser, err := userRepo.GetByEmail(ctx, cfg.SeedUserEmail)
	if err != nil {
		hash, err := bcrypt.GenerateFromPassword([]byte(cfg.SeedUserPassword), bcrypt.DefaultCost)
		if err != nil {
			log.Fatal().Err(err).Msg("failed to hash password")
		}
		demoUser = &model.User{
			Email:        cfg.SeedUserEmail,
			PasswordHash: string(hash),
		}
		if err := userRepo.Create(ctx, demoUser); err != nil {
			log.Fatal().Err(err).Msg("failed to create demo user")
		}
		log.Info().Str("id", demoUser.ID.String()).Msg("Created demo user")
	} else {
		log.Info().Str("id", demoUser.ID.String()).Msg("Demo user already exists")
	}

	// 2. Seed sample links
	log.Info().Msg("==> Seeding sample links...")
	future := time.Now().Add(30 * 24 * time.Hour)
	past := time.Now().Add(-2 * time.Hour)

	sampleLinks := []struct {
		code      string
		longURL   string
		isCustom  bool
		expiresAt *time.Time
	}{
		{code: "gh-repo", longURL: "https://github.com/scalelink/scalelink", isCustom: true, expiresAt: &future},
		{code: "go-doc", longURL: "https://go.dev/doc/effective_go", isCustom: true, expiresAt: nil},
		{code: "arch-post", longURL: "https://highscalability.com", isCustom: true, expiresAt: nil},
		{code: "expired-demo", longURL: "https://example.com/old-page", isCustom: true, expiresAt: &past},
	}

	for _, sl := range sampleLinks {
		existing, _ := linkRepo.GetByCode(ctx, sl.code)
		if existing == nil {
			link := &model.Link{
				ID:        uuid.New(),
				Code:      sl.code,
				LongURL:   sl.longURL,
				UserID:    &demoUser.ID,
				ExpiresAt: sl.expiresAt,
				IsCustom:  sl.isCustom,
			}
			if err := linkRepo.Create(ctx, link); err != nil {
				log.Warn().Err(err).Str("code", sl.code).Msg("could not insert link")
			} else {
				log.Info().Str("code", sl.code).Str("url", sl.longURL).Msg("Seeded link")
			}
		} else {
			log.Info().Str("code", sl.code).Msg("Link already exists")
		}
	}

	// 3. Seed backdated click analytics for active links
	log.Info().Msg("==> Seeding realistic backdated click analytics...")
	countries := []string{"US", "GB", "DE", "IN", "JP", "FR", "CA", "AU"}
	devices := []string{"desktop", "mobile", "tablet"}
	referrers := []string{"https://google.com", "https://twitter.com", "https://github.com", "https://news.ycombinator.com", "https://reddit.com", "direct"}

	rnd := rand.New(rand.NewSource(time.Now().UnixNano()))
	activeCodes := []string{"gh-repo", "go-doc", "arch-post"}

	for _, code := range activeCodes {
		var events []*model.ClickEvent
		// Generate 50-100 events across past 7 days
		numEvents := 50 + rnd.Intn(50)
		for i := 0; i < numEvents; i++ {
			daysAgo := rnd.Intn(7)
			hoursAgo := rnd.Intn(24)
			minutesAgo := rnd.Intn(60)
			eventTime := time.Now().Add(-time.Duration(daysAgo*24+hoursAgo)*time.Hour - time.Duration(minutesAgo)*time.Minute)

			events = append(events, &model.ClickEvent{
				ID:         uuid.NewString(),
				Code:       code,
				Timestamp:  eventTime,
				IP:         fmt.Sprintf("198.51.100.%d", rnd.Intn(250)+1),
				Country:    countries[rnd.Intn(len(countries))],
				DeviceType: devices[rnd.Intn(len(devices))],
				Referrer:   referrers[rnd.Intn(len(referrers))],
				UserAgent:  "Mozilla/5.0 (ScaleLink-SeedGenerator)",
			})
		}

		if err := statsRepo.InsertClickEvents(ctx, events); err != nil {
			log.Warn().Err(err).Str("code", code).Msg("error inserting seeded click events")
		} else {
			// update link click count
			_, _ = pool.Exec(ctx, `UPDATE links SET click_count = click_count + $1 WHERE code = $2`, len(events), code)
			log.Info().Str("code", code).Int("clicks", len(events)).Msg("Inserted backdated clicks")
		}
	}

	log.Info().Msg("======================================================")
	log.Info().Msg("ScaleLink Seed Complete!")
	log.Info().Str("Demo User", cfg.SeedUserEmail).Str("Password", cfg.SeedUserPassword).Msg("Credentials")
	log.Info().Msg("Active sample links: /gh-repo, /go-doc, /arch-post")
	log.Info().Msg("Expired sample link: /expired-demo (returns 410 Gone)")
	log.Info().Msg("======================================================")
}
