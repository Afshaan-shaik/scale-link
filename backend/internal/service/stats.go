package service

import (
	"context"
	"time"

	"github.com/scalelink/scalelink/internal/model"
	"github.com/scalelink/scalelink/internal/repository"
)

// StatsService encapsulates business logic for click analytics.
type StatsService struct {
	statsRepo *repository.StatsRepository
}

// NewStatsService creates a new StatsService.
func NewStatsService(statsRepo *repository.StatsRepository) *StatsService {
	return &StatsService{statsRepo: statsRepo}
}

// GetStats returns aggregated stats for a short code within the given date range.
func (s *StatsService) GetStats(ctx context.Context, code string, from, to time.Time) (*model.LinkStats, error) {
	// Ensure 'to' includes the full end day
	to = to.Add(24*time.Hour - time.Second)
	return s.statsRepo.GetStats(ctx, code, from, to)
}

// InsertClickEvents bulk-inserts raw click events (called by the worker).
func (s *StatsService) InsertClickEvents(ctx context.Context, events []*model.ClickEvent) error {
	return s.statsRepo.InsertClickEvents(ctx, events)
}
