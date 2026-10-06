package service

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"

	"github.com/scalelink/scalelink/internal/cache"
	"github.com/scalelink/scalelink/internal/config"
	"github.com/scalelink/scalelink/internal/model"
	"github.com/scalelink/scalelink/internal/repository"
	"github.com/scalelink/scalelink/internal/shortcode"
	"github.com/scalelink/scalelink/internal/validator"
)

// maxRetries is the number of times we retry on a code collision before giving up.
const maxRetries = 5

// ErrExpired is returned when a link exists but has passed its expiry.
var ErrExpired = errors.New("link expired")

// ErrDeleted is returned when a link has been soft-deleted.
var ErrDeleted = errors.New("link deleted")

// ErrAliasConflict is returned when a custom alias is already taken.
var ErrAliasConflict = errors.New("alias already taken")

// ErrAliasReserved is returned when the alias is a reserved word.
var ErrAliasReserved = errors.New("alias is reserved")

// ErrDomainBlocked is returned when the destination domain is blocked.
var ErrDomainBlocked = errors.New("destination domain is blocked")

// CreateLinkRequest holds all parameters for creating a new link.
type CreateLinkRequest struct {
	LongURL     string
	CustomAlias string     // optional; empty = generate random code
	ExpiresAt   *time.Time // optional
	UserID      *uuid.UUID // nil for anonymous
}

// CreateLinkResponse is returned after successful link creation.
type CreateLinkResponse struct {
	Link     *model.Link
	ShortURL string
}

// LinkService encapsulates business logic for creating and resolving links.
type LinkService struct {
	cfg         *config.Config
	linkRepo    *repository.LinkRepository
	blockRepo   *repository.BlocklistRepository
	cache       *cache.LinkCache
	codeLen     int

	// blocklist cache — reloaded on startup and periodically refreshed
	blockedMu      sync.RWMutex
	blockedDomains map[string]struct{}
}

// NewLinkService creates a new LinkService with a warm blocklist cache.
func NewLinkService(
	cfg *config.Config,
	linkRepo *repository.LinkRepository,
	blockRepo *repository.BlocklistRepository,
	linkCache *cache.LinkCache,
) (*LinkService, error) {
	svc := &LinkService{
		cfg:       cfg,
		linkRepo:  linkRepo,
		blockRepo: blockRepo,
		cache:     linkCache,
		codeLen:   cfg.ShortCodeLength,
	}

	if err := svc.refreshBlocklist(context.Background()); err != nil {
		log.Warn().Err(err).Msg("could not load blocklist on startup")
	}

	return svc, nil
}

// Create validates and persists a new short link.
func (s *LinkService) Create(ctx context.Context, req CreateLinkRequest) (*CreateLinkResponse, error) {
	// 1. Validate the long URL
	if err := validator.ValidateURL(req.LongURL, s.cfg.BaseURL); err != nil {
		return nil, err
	}

	// 2. Check domain blocklist
	s.blockedMu.RLock()
	blocked := s.blockedDomains
	s.blockedMu.RUnlock()

	if validator.IsBlockedDomain(req.LongURL, blocked) {
		return nil, ErrDomainBlocked
	}

	// 3. Determine short code
	var code string
	var isCustom bool

	if req.CustomAlias != "" {
		// Validate alias format
		if !shortcode.IsValidAlias(req.CustomAlias) {
			return nil, fmt.Errorf("alias must be 3-20 characters, only [A-Za-z0-9_-] allowed")
		}
		if shortcode.IsReserved(req.CustomAlias) {
			return nil, ErrAliasReserved
		}
		code = req.CustomAlias
		isCustom = true
	} else {
		// Generate random code with collision retry
		var err error
		code, err = s.generateUniqueCode(ctx)
		if err != nil {
			return nil, err
		}
	}

	// 4. Build and persist the link
	link := &model.Link{
		ID:        uuid.New(),
		Code:      code,
		LongURL:   req.LongURL,
		UserID:    req.UserID,
		ExpiresAt: req.ExpiresAt,
		IsCustom:  isCustom,
	}

	if err := s.linkRepo.Create(ctx, link); err != nil {
		if errors.Is(err, repository.ErrConflict) {
			if isCustom {
				return nil, ErrAliasConflict
			}
			// Random code collision (extremely rare): treat as internal error
			return nil, fmt.Errorf("code collision after retries, please try again")
		}
		return nil, fmt.Errorf("create link: %w", err)
	}

	if s.cache != nil && isCustom {
		_ = s.cache.Invalidate(ctx, code)
	}

	return &CreateLinkResponse{
		Link:     link,
		ShortURL: fmt.Sprintf("%s/%s", s.cfg.BaseURL, link.Code),
	}, nil
}

// Resolve returns the destination URL for a given code.
// It checks expiry and deleted status, returning typed errors for callers
// to map to the correct HTTP status (410 Gone, 404 Not Found).
func (s *LinkService) Resolve(ctx context.Context, code string) (*model.Link, error) {
	link, err := s.linkRepo.GetByCode(ctx, code)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, repository.ErrNotFound
		}
		return nil, fmt.Errorf("resolve link: %w", err)
	}

	if link.IsExpired() {
		return nil, ErrExpired
	}

	return link, nil
}

// SoftDelete removes a link (owner-only) and invalidates cache.
func (s *LinkService) SoftDelete(ctx context.Context, id uuid.UUID, userID uuid.UUID) error {
	code, err := s.linkRepo.SoftDelete(ctx, id, userID)
	if err != nil {
		return err
	}
	if s.cache != nil && code != "" {
		_ = s.cache.Invalidate(ctx, code)
	}
	return nil
}

// UpdateExpiry changes the expiry of a link (owner-only) and invalidates cache.
func (s *LinkService) UpdateExpiry(ctx context.Context, id uuid.UUID, userID uuid.UUID, expiresAt *time.Time) error {
	code, err := s.linkRepo.UpdateExpiry(ctx, id, userID, expiresAt)
	if err != nil {
		return err
	}
	if s.cache != nil && code != "" {
		_ = s.cache.Invalidate(ctx, code)
	}
	return nil
}

// ListByUser returns paginated links for a user.
func (s *LinkService) ListByUser(ctx context.Context, userID uuid.UUID, limit, offset int, search string) ([]*model.Link, int, error) {
	return s.linkRepo.ListByUser(ctx, userID, limit, offset, search)
}

// ListPublic returns all active links for public monitoring.
func (s *LinkService) ListPublic(ctx context.Context, limit, offset int, search string) ([]*model.Link, int, error) {
	return s.linkRepo.ListAll(ctx, limit, offset, search)
}

// IncrementClick atomically increments click count for a link.
func (s *LinkService) IncrementClick(ctx context.Context, code string) error {
	return s.linkRepo.IncrementClickCount(ctx, code, 1)
}

// SyncLinks merges incoming links into cache/repository for resilient multi-instance routing.
func (s *LinkService) SyncLinks(ctx context.Context, links []*model.Link) error {
	s.linkRepo.SyncMemLinks(links)
	return nil
}

// GetByCode returns a link by code (including expiry info, for stats access).
func (s *LinkService) GetByCode(ctx context.Context, code string) (*model.Link, error) {
	return s.linkRepo.GetByCode(ctx, code)
}

// GetByID returns a link by ID for a specific user.
func (s *LinkService) GetByID(ctx context.Context, id uuid.UUID, userID uuid.UUID) (*model.Link, error) {
	return s.linkRepo.GetByID(ctx, id, userID)
}

// RefreshBlocklist reloads the blocked domains from the database.
func (s *LinkService) RefreshBlocklist(ctx context.Context) error {
	return s.refreshBlocklist(ctx)
}

// ── helpers ──────────────────────────────────────────────────────────────────

func (s *LinkService) generateUniqueCode(ctx context.Context) (string, error) {
	for attempt := 0; attempt < maxRetries; attempt++ {
		code, err := shortcode.Generate(s.codeLen)
		if err != nil {
			return "", fmt.Errorf("generate code: %w", err)
		}
		exists, err := s.linkRepo.CodeExists(ctx, code)
		if err != nil {
			return "", fmt.Errorf("check code existence: %w", err)
		}
		if !exists {
			return code, nil
		}
		log.Debug().Str("code", code).Int("attempt", attempt+1).Msg("code collision, retrying")
	}
	return "", fmt.Errorf("exceeded %d retry attempts for code generation", maxRetries)
}

func (s *LinkService) refreshBlocklist(ctx context.Context) error {
	domains, err := s.blockRepo.LoadAll(ctx)
	if err != nil {
		return err
	}
	s.blockedMu.Lock()
	s.blockedDomains = domains
	s.blockedMu.Unlock()
	log.Info().Int("count", len(domains)).Msg("blocklist refreshed")
	return nil
}
