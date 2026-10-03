package cache

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"

	"github.com/scalelink/scalelink/internal/metrics"
)

var (
	// ErrCacheMiss indicates that the requested key does not exist in cache.
	ErrCacheMiss = errors.New("cache miss")
)

const (
	linkKeyPrefix     = "link:code:"
	negativeKeyPrefix = "link:neg:"
)

// LinkCache handles caching for short links and negative lookups.
type LinkCache struct {
	rdb *redis.Client
}

// NewLinkCache creates a new LinkCache. If rdb is nil, cache operations gracefully no-op.
func NewLinkCache(rdb *redis.Client) *LinkCache {
	return &LinkCache{rdb: rdb}
}

// GetLink attempts to fetch the destination URL for a given short code.
// Returns:
//   - (longURL, false, nil) on a valid cache hit.
//   - ("", true, nil) on a negative cache hit (known non-existent code).
//   - ("", false, ErrCacheMiss) on miss or if Redis is unavailable.
func (c *LinkCache) GetLink(ctx context.Context, code string) (string, bool, error) {
	if c.rdb == nil {
		return "", false, ErrCacheMiss
	}

	key := linkKeyPrefix + code
	val, err := c.rdb.Get(ctx, key).Result()
	if err == nil && val != "" {
		metrics.CacheHits.WithLabelValues("link").Inc()
		return val, false, nil
	}

	// Check negative cache
	negKey := negativeKeyPrefix + code
	negVal, err := c.rdb.Get(ctx, negKey).Result()
	if err == nil && negVal != "" {
		metrics.CacheHits.WithLabelValues("negative").Inc()
		return "", true, nil
	}

	metrics.CacheMisses.WithLabelValues("link").Inc()
	return "", false, ErrCacheMiss
}

// SetLink stores an active link destination URL in cache with the configured TTL.
func (c *LinkCache) SetLink(ctx context.Context, code, longURL string, ttl time.Duration) error {
	if c.rdb == nil {
		return nil
	}
	key := linkKeyPrefix + code
	if err := c.rdb.Set(ctx, key, longURL, ttl).Err(); err != nil {
		log.Warn().Err(err).Str("code", code).Msg("failed to cache link")
		return fmt.Errorf("set link cache: %w", err)
	}
	return nil
}

// SetNegative stores a negative entry (code does not exist) with a short TTL to prevent penetration attacks.
func (c *LinkCache) SetNegative(ctx context.Context, code string, ttl time.Duration) error {
	if c.rdb == nil {
		return nil
	}
	key := negativeKeyPrefix + code
	if err := c.rdb.Set(ctx, key, "1", ttl).Err(); err != nil {
		log.Warn().Err(err).Str("code", code).Msg("failed to set negative cache")
		return fmt.Errorf("set negative cache: %w", err)
	}
	return nil
}

// Invalidate removes cached entries for a code (called on link deletion or expiry update).
func (c *LinkCache) Invalidate(ctx context.Context, code string) error {
	if c.rdb == nil {
		return nil
	}
	keys := []string{linkKeyPrefix + code, negativeKeyPrefix + code}
	if err := c.rdb.Del(ctx, keys...).Err(); err != nil {
		log.Warn().Err(err).Str("code", code).Msg("failed to invalidate cache")
		return fmt.Errorf("invalidate cache: %w", err)
	}
	return nil
}
