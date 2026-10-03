package cache

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestLinkCache_GracefulDegradationWhenNil(t *testing.T) {
	cache := NewLinkCache(nil)
	ctx := context.Background()

	// Should return ErrCacheMiss when nil
	url, isNeg, err := cache.GetLink(ctx, "abc123")
	assert.ErrorIs(t, err, ErrCacheMiss)
	assert.Empty(t, url)
	assert.False(t, isNeg)

	// SetLink should not panic
	err = cache.SetLink(ctx, "abc123", "https://example.com", time.Hour)
	assert.NoError(t, err)

	// SetNegative should not panic
	err = cache.SetNegative(ctx, "abc123", 5*time.Minute)
	assert.NoError(t, err)

	// Invalidate should not panic
	err = cache.Invalidate(ctx, "abc123")
	assert.NoError(t, err)
}
