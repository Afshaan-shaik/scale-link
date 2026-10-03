package model

import (
	"time"

	"github.com/google/uuid"
)

// ── User ─────────────────────────────────────────────────────────────────────

// User represents an authenticated account.
type User struct {
	ID           uuid.UUID  `json:"id"`
	Email        string     `json:"email"`
	PasswordHash string     `json:"-"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
	DeletedAt    *time.Time `json:"-"`
}

// ── APIKey ────────────────────────────────────────────────────────────────────

// APIKey represents a hashed API key belonging to a user.
type APIKey struct {
	ID        uuid.UUID  `json:"id"`
	UserID    uuid.UUID  `json:"user_id"`
	Name      string     `json:"name"`
	KeyHash   string     `json:"-"`
	KeyPrefix string     `json:"key_prefix"` // first 8 chars for display
	CreatedAt time.Time  `json:"created_at"`
	LastUsed  *time.Time `json:"last_used,omitempty"`
	RevokedAt *time.Time `json:"revoked_at,omitempty"`
}

// ── Link ──────────────────────────────────────────────────────────────────────

// Link is the core domain entity representing a shortened URL.
type Link struct {
	ID          uuid.UUID  `json:"id"`
	Code        string     `json:"code"`
	LongURL     string     `json:"long_url"`
	UserID      *uuid.UUID `json:"user_id,omitempty"`
	ExpiresAt   *time.Time `json:"expires_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	DeletedAt   *time.Time `json:"deleted_at,omitempty"`
	ClickCount  int64      `json:"click_count"`
	IsCustom    bool       `json:"is_custom"`
}

// IsExpired reports whether the link has passed its expiry time.
func (l *Link) IsExpired() bool {
	return l.ExpiresAt != nil && time.Now().After(*l.ExpiresAt)
}

// IsDeleted reports whether the link has been soft-deleted.
func (l *Link) IsDeleted() bool {
	return l.DeletedAt != nil
}

// ── ClickEvent ────────────────────────────────────────────────────────────────

// ClickEvent is a raw analytics event published to Redis Streams.
type ClickEvent struct {
	ID         string    `json:"id"`           // Redis stream entry ID
	Code       string    `json:"code"`
	Timestamp  time.Time `json:"timestamp"`
	IP         string    `json:"ip"`
	Country    string    `json:"country"`      // ISO 3166-1 alpha-2 or "XX"
	DeviceType string    `json:"device_type"`  // mobile/desktop/tablet/bot
	Referrer   string    `json:"referrer"`
	UserAgent  string    `json:"user_agent"`
}

// ── BlockedDomain ─────────────────────────────────────────────────────────────

// BlockedDomain represents a domain that is not allowed as a destination.
type BlockedDomain struct {
	ID        int       `json:"id"`
	Domain    string    `json:"domain"`
	Reason    string    `json:"reason"`
	CreatedAt time.Time `json:"created_at"`
}

// ── Stats ─────────────────────────────────────────────────────────────────────

// LinkStats aggregates click analytics for a link.
type LinkStats struct {
	Code      string         `json:"code"`
	Total     int64          `json:"total"`
	PerDay    []DayStat      `json:"per_day"`
	Countries []CountryStat  `json:"countries"`
	Devices   []DeviceStat   `json:"devices"`
	Referrers []ReferrerStat `json:"referrers"`
}

// DayStat holds click count for a single day.
type DayStat struct {
	Date  string `json:"date"` // YYYY-MM-DD
	Count int64  `json:"count"`
}

// CountryStat holds click count per country code.
type CountryStat struct {
	Country string `json:"country"`
	Count   int64  `json:"count"`
}

// DeviceStat holds click count per device type.
type DeviceStat struct {
	DeviceType string `json:"device_type"`
	Count      int64  `json:"count"`
}

// ReferrerStat holds click count per referrer domain.
type ReferrerStat struct {
	Referrer string `json:"referrer"`
	Count    int64  `json:"count"`
}

// ── Pagination ────────────────────────────────────────────────────────────────

// Page holds pagination metadata.
type Page struct {
	Limit  int `json:"limit"`
	Offset int `json:"offset"`
	Total  int `json:"total"`
}
