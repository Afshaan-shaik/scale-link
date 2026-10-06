package handler

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/scalelink/scalelink/internal/analytics"
	"github.com/scalelink/scalelink/internal/cache"
	"github.com/scalelink/scalelink/internal/middleware"
	"github.com/scalelink/scalelink/internal/model"
	"github.com/scalelink/scalelink/internal/repository"
	"github.com/scalelink/scalelink/internal/service"
	"github.com/scalelink/scalelink/internal/stream"
	"github.com/scalelink/scalelink/internal/validator"
)

// LinkHandler handles all link-related HTTP endpoints.
type LinkHandler struct {
	linkSvc      *service.LinkService
	statsSvc     *service.StatsService
	cache        *cache.LinkCache
	producer     *stream.Producer
	redirectCode int
	linkTTL      time.Duration
	negativeTTL  time.Duration
}

// NewLinkHandler creates a new LinkHandler with cache and stream support.
func NewLinkHandler(
	linkSvc *service.LinkService,
	statsSvc *service.StatsService,
	linkCache *cache.LinkCache,
	producer *stream.Producer,
	redirectCode int,
	linkTTL time.Duration,
	negativeTTL time.Duration,
) *LinkHandler {
	return &LinkHandler{
		linkSvc:      linkSvc,
		statsSvc:     statsSvc,
		cache:        linkCache,
		producer:     producer,
		redirectCode: redirectCode,
		linkTTL:      linkTTL,
		negativeTTL:  negativeTTL,
	}
}

// ── POST /api/links ───────────────────────────────────────────────────────────

type createLinkRequest struct {
	LongURL     string  `json:"long_url"`
	CustomAlias string  `json:"custom_alias,omitempty"`
	ExpiresAt   *string `json:"expires_at,omitempty"` // RFC3339 or null
	TTLSeconds  *int    `json:"ttl_seconds,omitempty"` // alternative to expires_at
}

type createLinkResponse struct {
	ID        string     `json:"id"`
	Code      string     `json:"code"`
	ShortURL  string     `json:"short_url"`
	LongURL   string     `json:"long_url"`
	ExpiresAt *time.Time `json:"expires_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
	IsCustom  bool       `json:"is_custom"`
}

// CreateLink handles POST /api/links
func (h *LinkHandler) CreateLink(w http.ResponseWriter, r *http.Request) {
	logger := zerolog.Ctx(r.Context())

	var req createLinkRequest
	if err := decode(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.LongURL == "" {
		respondError(w, http.StatusBadRequest, "long_url is required")
		return
	}

	// Resolve expiry
	var expiresAt *time.Time
	if req.ExpiresAt != nil && *req.ExpiresAt != "" {
		t, err := time.Parse(time.RFC3339, *req.ExpiresAt)
		if err != nil {
			respondError(w, http.StatusBadRequest, "expires_at must be RFC3339 format")
			return
		}
		if t.Before(time.Now()) {
			respondError(w, http.StatusBadRequest, "expires_at must be in the future")
			return
		}
		expiresAt = &t
	} else if req.TTLSeconds != nil && *req.TTLSeconds > 0 {
		t := time.Now().Add(time.Duration(*req.TTLSeconds) * time.Second)
		expiresAt = &t
	}

	// Extract optional user ID from auth context
	var userID *uuid.UUID
	if claims, ok := middleware.ClaimsFromContext(r.Context()); ok {
		id, err := uuid.Parse(claims.UserID)
		if err == nil {
			userID = &id
		}
	}

	// Extract optional anonymous workspace ID from session context
	var workspaceID *uuid.UUID
	if wsID, ok := middleware.WorkspaceIDFromContext(r.Context()); ok {
		workspaceID = &wsID
	}

	createReq := service.CreateLinkRequest{
		LongURL:     req.LongURL,
		CustomAlias: req.CustomAlias,
		ExpiresAt:   expiresAt,
		UserID:      userID,
		WorkspaceID: workspaceID,
	}

	result, err := h.linkSvc.Create(r.Context(), createReq)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrAliasConflict):
			respondError(w, http.StatusConflict, "custom alias is already taken")
		case errors.Is(err, service.ErrAliasReserved):
			respondError(w, http.StatusConflict, "alias is a reserved word")
		case errors.Is(err, service.ErrDomainBlocked):
			respondError(w, http.StatusUnprocessableEntity, "destination domain is blocked")
		default:
			var urlErr *validator.ErrInvalidURL
			if errors.As(err, &urlErr) {
				respondError(w, http.StatusUnprocessableEntity, urlErr.Error())
				return
			}
			logger.Error().Err(err).Msg("create link failed")
			respondError(w, http.StatusInternalServerError, "failed to create link")
		}
		return
	}

	respond(w, http.StatusCreated, createLinkResponse{
		ID:        result.Link.ID.String(),
		Code:      result.Link.Code,
		ShortURL:  result.ShortURL,
		LongURL:   result.Link.LongURL,
		ExpiresAt: result.Link.ExpiresAt,
		CreatedAt: result.Link.CreatedAt,
		IsCustom:  result.Link.IsCustom,
	})
}

// ── GET /{code} ───────────────────────────────────────────────────────────────

// Redirect handles GET /{code} — the hot path with cache-aside and negative caching.
func (h *LinkHandler) Redirect(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	logger := zerolog.Ctx(r.Context())

	// 1. Check Redis cache first (Cache-Aside)
	if h.cache != nil {
		longURL, isNegative, err := h.cache.GetLink(r.Context(), code)
		if err == nil {
			if isNegative {
				w.Header().Set("X-Cache", "HIT")
				w.Header().Set("X-Served-By", "redis-negative")
				respondError(w, http.StatusNotFound, fmt.Sprintf("short code %q not found", code))
				return
			}
			w.Header().Set("X-Cache", "HIT")
			w.Header().Set("X-Served-By", "redis")
			h.publishClick(r, code)
			http.Redirect(w, r, longURL, h.redirectCode)
			return
		}
	}

	// 2. Cache MISS: Query database
	link, err := h.linkSvc.Resolve(r.Context(), code)
	if err != nil {
		switch {
		case errors.Is(err, repository.ErrNotFound):
			if h.cache != nil {
				_ = h.cache.SetNegative(r.Context(), code, h.negativeTTL)
			}
			w.Header().Set("X-Cache", "MISS")
			w.Header().Set("X-Served-By", "db")
			if strings.Contains(r.Header.Get("Accept"), "text/html") {
				http.Redirect(w, r, "/?r="+code, http.StatusFound)
				return
			}
			respondError(w, http.StatusNotFound, fmt.Sprintf("short code %q not found", code))
		case errors.Is(err, service.ErrExpired):
			if h.cache != nil {
				_ = h.cache.Invalidate(r.Context(), code)
			}
			w.Header().Set("X-Cache", "MISS")
			w.Header().Set("X-Served-By", "db")
			if strings.Contains(r.Header.Get("Accept"), "text/html") {
				http.Redirect(w, r, "/?error=expired&code="+code, http.StatusFound)
				return
			}
			respondError(w, http.StatusGone, "this link has expired")
		default:
			logger.Error().Err(err).Str("code", code).Msg("redirect failed")
			respondError(w, http.StatusInternalServerError, "redirect failed")
		}
		return
	}

	// 3. Populate Redis Cache for active link
	if h.cache != nil {
		_ = h.cache.SetLink(r.Context(), code, link.LongURL, h.linkTTL)
	}

	w.Header().Set("X-Cache", "MISS")
	w.Header().Set("X-Served-By", "db")
	_ = h.linkSvc.IncrementClick(r.Context(), code)
	h.publishClick(r, code)
	http.Redirect(w, r, link.LongURL, h.redirectCode)
}

func (h *LinkHandler) publishClick(r *http.Request, code string) {
	if h.producer == nil {
		return
	}
	ip := r.RemoteAddr
	if realIP := r.Header.Get("X-Real-IP"); realIP != "" {
		ip = realIP
	}
	ev := &model.ClickEvent{
		Code:       code,
		Timestamp:  time.Now().UTC(),
		IP:         ip,
		Country:    analytics.ParseCountry(r),
		DeviceType: analytics.ParseDeviceType(r.UserAgent()),
		Referrer:   r.Referer(),
		UserAgent:  r.UserAgent(),
	}
	h.producer.PublishAsync(ev)
}

// ── GET /api/links ────────────────────────────────────────────────────────────

type listLinksResponse struct {
	Links  []*linkSummary `json:"links"`
	Total  int            `json:"total"`
	Limit  int            `json:"limit"`
	Offset int            `json:"offset"`
}

type linkSummary struct {
	ID         string     `json:"id"`
	Code       string     `json:"code"`
	ShortURL   string     `json:"short_url"`
	LongURL    string     `json:"long_url"`
	ClickCount int64      `json:"click_count"`
	ExpiresAt  *time.Time `json:"expires_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	IsCustom   bool       `json:"is_custom"`
	IsExpired  bool       `json:"is_expired"`
}

// ListLinks handles GET /api/links (optional code query, public overview, or auth user list)
func (h *LinkHandler) ListLinks(w http.ResponseWriter, r *http.Request) {
	baseURL := r.Header.Get("X-Base-URL")
	if baseURL == "" {
		baseURL = fmt.Sprintf("%s://%s", scheme(r), r.Host)
	}

	q := r.URL.Query()
	if code := q.Get("code"); code != "" {
		if q.Get("click") == "true" {
			_ = h.linkSvc.IncrementClick(r.Context(), code)
			h.publishClick(r, code)
		}
		link, err := h.linkSvc.GetByCode(r.Context(), code)
		if err != nil {
			respondError(w, http.StatusNotFound, "link not found")
			return
		}
		respond(w, http.StatusOK, map[string]interface{}{
			"link": toLinkSummary(link, baseURL),
		})
		return
	}

	limit := parseInt(q.Get("limit"), 50)
	offset := parseInt(q.Get("offset"), 0)
	search := q.Get("q")

	if limit > 100 {
		limit = 100
	}

	// 1. If anonymous workspace context exists, return ONLY this workspace's links (Strict Isolation)
	if wsID, ok := middleware.WorkspaceIDFromContext(r.Context()); ok {
		links, total, err := h.linkSvc.ListByWorkspace(r.Context(), wsID, limit, offset, search)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "failed to list workspace links")
			return
		}

		summaries := make([]*linkSummary, 0, len(links))
		for _, l := range links {
			summaries = append(summaries, toLinkSummary(l, baseURL))
		}

		respond(w, http.StatusOK, listLinksResponse{
			Links:  summaries,
			Total:  total,
			Limit:  limit,
			Offset: offset,
		})
		return
	}

	// 2. If JWT authenticated user, return user's links
	if claims, ok := middleware.ClaimsFromContext(r.Context()); ok {
		userID, err := uuid.Parse(claims.UserID)
		if err == nil {
			links, total, err := h.linkSvc.ListByUser(r.Context(), userID, limit, offset, search)
			if err == nil {
				summaries := make([]*linkSummary, 0, len(links))
				for _, l := range links {
					summaries = append(summaries, toLinkSummary(l, baseURL))
				}
				respond(w, http.StatusOK, listLinksResponse{
					Links:  summaries,
					Total:  total,
					Limit:  limit,
					Offset: offset,
				})
				return
			}
		}
	}

	// 3. Unauthenticated query: return empty list (Strict Isolation - never leak other users' links!)
	respond(w, http.StatusOK, listLinksResponse{
		Links:  []*linkSummary{},
		Total:  0,
		Limit:  limit,
		Offset: offset,
	})
}

// ResolvePublic handles public GET /api/links/resolve/{code}
func (h *LinkHandler) ResolvePublic(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	if r.URL.Query().Get("click") == "true" {
		_ = h.linkSvc.IncrementClick(r.Context(), code)
		h.publishClick(r, code)
	}
	link, err := h.linkSvc.GetByCode(r.Context(), code)
	if err != nil {
		respondError(w, http.StatusNotFound, "link not found")
		return
	}
	baseURL := r.Header.Get("X-Base-URL")
	if baseURL == "" {
		baseURL = fmt.Sprintf("%s://%s", scheme(r), r.Host)
	}
	respond(w, http.StatusOK, map[string]interface{}{
		"link": toLinkSummary(link, baseURL),
	})
}

// ── GET /api/links/{code} ──────────────────────────────────────────────────

// GetLink handles GET /api/links/{code}
func (h *LinkHandler) GetLink(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	link, err := h.linkSvc.GetByCode(r.Context(), code)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondError(w, http.StatusNotFound, "link not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to get link")
		return
	}

	// Verify ownership:
	if wsID, ok := middleware.WorkspaceIDFromContext(r.Context()); ok {
		if link.WorkspaceID == nil || *link.WorkspaceID != wsID {
			respondError(w, http.StatusForbidden, "access denied")
			return
		}
	} else if claims, ok := middleware.ClaimsFromContext(r.Context()); ok {
		userID, err := uuid.Parse(claims.UserID)
		if err != nil || link.UserID == nil || *link.UserID != userID {
			respondError(w, http.StatusForbidden, "access denied")
			return
		}
	} else {
		respondError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	baseURL := fmt.Sprintf("%s://%s", scheme(r), r.Host)
	respond(w, http.StatusOK, toLinkSummary(link, baseURL))
}

// ── PATCH /api/links/{id} ─────────────────────────────────────────────────

type updateLinkRequest struct {
	ExpiresAt *string `json:"expires_at"` // null to clear, RFC3339 to set
}

// UpdateLink handles PATCH /api/links/{id} (only expiry is editable)
func (h *LinkHandler) UpdateLink(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	linkID, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid link ID")
		return
	}

	var req updateLinkRequest
	if err := decode(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var expiresAt *time.Time
	if req.ExpiresAt != nil && *req.ExpiresAt != "" {
		t, err := time.Parse(time.RFC3339, *req.ExpiresAt)
		if err != nil {
			respondError(w, http.StatusBadRequest, "expires_at must be RFC3339")
			return
		}
		expiresAt = &t
	}

	// 1. Check workspace context
	if wsID, ok := middleware.WorkspaceIDFromContext(r.Context()); ok {
		if err := h.linkSvc.UpdateExpiryByWorkspace(r.Context(), linkID, wsID, expiresAt); err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				respondError(w, http.StatusNotFound, "link not found or access denied")
				return
			}
			respondError(w, http.StatusInternalServerError, "failed to update link")
			return
		}
		respond(w, http.StatusOK, map[string]string{"status": "updated"})
		return
	}

	// 2. Check JWT user context
	if claims, ok := middleware.ClaimsFromContext(r.Context()); ok {
		userID, _ := uuid.Parse(claims.UserID)
		if err := h.linkSvc.UpdateExpiry(r.Context(), linkID, userID, expiresAt); err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				respondError(w, http.StatusNotFound, "link not found or access denied")
				return
			}
			respondError(w, http.StatusInternalServerError, "failed to update link")
			return
		}
		respond(w, http.StatusOK, map[string]string{"status": "updated"})
		return
	}

	respondError(w, http.StatusUnauthorized, "authentication required")
}

// ── DELETE /api/links/{id} ────────────────────────────────────────────────

// DeleteLink handles DELETE /api/links/{id}
func (h *LinkHandler) DeleteLink(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	linkID, err := uuid.Parse(idStr)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid link ID")
		return
	}

	// 1. Check workspace context
	if wsID, ok := middleware.WorkspaceIDFromContext(r.Context()); ok {
		if err := h.linkSvc.SoftDeleteByWorkspace(r.Context(), linkID, wsID); err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				respondError(w, http.StatusNotFound, "link not found or access denied")
				return
			}
			respondError(w, http.StatusInternalServerError, "failed to delete link")
			return
		}
		respond(w, http.StatusOK, map[string]string{"status": "deleted"})
		return
	}

	// 2. Check JWT user context
	if claims, ok := middleware.ClaimsFromContext(r.Context()); ok {
		userID, _ := uuid.Parse(claims.UserID)
		if err := h.linkSvc.SoftDelete(r.Context(), linkID, userID); err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				respondError(w, http.StatusNotFound, "link not found or access denied")
				return
			}
			respondError(w, http.StatusInternalServerError, "failed to delete link")
			return
		}
		respond(w, http.StatusOK, map[string]string{"status": "deleted"})
		return
	}

	respondError(w, http.StatusUnauthorized, "authentication required")
}

// ── GET /api/links/{code}/stats ────────────────────────────────────────────

// GetStats handles GET /api/links/{code}/stats
func (h *LinkHandler) GetStats(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")

	// Verify link exists
	link, err := h.linkSvc.GetByCode(r.Context(), code)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			respondError(w, http.StatusNotFound, "link not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "failed to get link")
		return
	}

	// Verify ownership unless public demo link gh-repo
	if code != "gh-repo" {
		if link.WorkspaceID != nil {
			wsID, ok := middleware.WorkspaceIDFromContext(r.Context())
			if !ok || *link.WorkspaceID != wsID {
				respondError(w, http.StatusForbidden, "access denied")
				return
			}
		} else if link.UserID != nil {
			claims, ok := middleware.ClaimsFromContext(r.Context())
			if !ok {
				respondError(w, http.StatusUnauthorized, "authentication required")
				return
			}
			userID, err := uuid.Parse(claims.UserID)
			if err != nil || *link.UserID != userID {
				respondError(w, http.StatusForbidden, "access denied")
				return
			}
		}
	}

	// Date range defaults: last 30 days up to end of today
	q := r.URL.Query()
	from := parseDate(q.Get("from"), time.Now().AddDate(0, 0, -30))
	var to time.Time
	if toStr := q.Get("to"); toStr != "" {
		if parsed, err := time.Parse("2006-01-02", toStr); err == nil {
			to = time.Date(parsed.Year(), parsed.Month(), parsed.Day(), 23, 59, 59, 999999999, time.UTC)
		} else {
			to = time.Now().Add(time.Hour)
		}
	} else {
		to = time.Now().Add(time.Hour)
	}

	stats, err := h.statsSvc.GetStats(r.Context(), code, from, to)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to get stats")
		return
	}

	respond(w, http.StatusOK, stats)
}

// ── helpers ───────────────────────────────────────────────────────────────────

func toLinkSummary(l *model.Link, baseURL string) *linkSummary {
	return &linkSummary{
		ID:         l.ID.String(),
		Code:       l.Code,
		ShortURL:   fmt.Sprintf("%s/%s", baseURL, l.Code),
		LongURL:    l.LongURL,
		ClickCount: l.ClickCount,
		ExpiresAt:  l.ExpiresAt,
		CreatedAt:  l.CreatedAt,
		IsCustom:   l.IsCustom,
		IsExpired:  l.IsExpired(),
	}
}

type syncLinksRequest struct {
	Links []struct {
		ID         string     `json:"id"`
		Code       string     `json:"code"`
		LongURL    string     `json:"long_url"`
		ClickCount int64      `json:"click_count"`
		ExpiresAt  *time.Time `json:"expires_at"`
		IsCustom   bool       `json:"is_custom"`
	} `json:"links"`
}

// SyncLinks handles POST /api/links/sync
func (h *LinkHandler) SyncLinks(w http.ResponseWriter, r *http.Request) {
	var req syncLinksRequest
	if err := decode(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	models := make([]*model.Link, 0, len(req.Links))
	for _, l := range req.Links {
		if l.Code == "" || l.LongURL == "" {
			continue
		}
		var parsedID uuid.UUID
		if l.ID != "" {
			parsedID, _ = uuid.Parse(l.ID)
		}
		if parsedID == uuid.Nil {
			parsedID = uuid.New()
		}
		var wsPtr *uuid.UUID
		if wsID, ok := middleware.WorkspaceIDFromContext(r.Context()); ok {
			wsPtr = &wsID
		}
		models = append(models, &model.Link{
			ID:          parsedID,
			Code:        l.Code,
			LongURL:     l.LongURL,
			ClickCount:  l.ClickCount,
			ExpiresAt:   l.ExpiresAt,
			IsCustom:    l.IsCustom,
			WorkspaceID: wsPtr,
		})
	}

	_ = h.linkSvc.SyncLinks(r.Context(), models)
	respond(w, http.StatusOK, map[string]interface{}{
		"status": "ok",
		"synced": len(models),
	})
}

func parseInt(s string, def int) int {
	if s == "" {
		return def
	}
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return def
		}
		n = n*10 + int(c-'0')
	}
	return n
}

func parseDate(s string, def time.Time) time.Time {
	if s == "" {
		return def
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return def
	}
	return t
}

func scheme(r *http.Request) string {
	if r.TLS != nil {
		return "https"
	}
	if proto := r.Header.Get("X-Forwarded-Proto"); proto != "" {
		return proto
	}
	return "http"
}
