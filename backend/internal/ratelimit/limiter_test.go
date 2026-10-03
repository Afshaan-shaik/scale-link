package ratelimit

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestTokenBucketLimiter_GracefulDegradationWhenNil(t *testing.T) {
	limiter := NewTokenBucketLimiter(nil)
	ctx := context.Background()

	res, err := limiter.Allow(ctx, "create", "ip:127.0.0.1", 60)
	assert.NoError(t, err)
	assert.True(t, res.Allowed)
	assert.Equal(t, 60, res.Capacity)
	assert.Equal(t, 60, res.Remaining)
	assert.Equal(t, 0, res.RetryAfter)
}
