package ratelimit

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"

	"github.com/scalelink/scalelink/internal/metrics"
)

// luaTokenBucket is an atomic token-bucket rate limiter script.
var luaTokenBucket = redis.NewScript(`
local key = KEYS[1]
local rate = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])

local data = redis.call('HMGET', key, 'tokens', 'last')
local tokens = tonumber(data[1])
local last = tonumber(data[2])

if not tokens then
    tokens = capacity
    last = now
else
    local elapsed = (now - last) / 1000.0
    tokens = math.min(capacity, tokens + elapsed * rate)
    last = now
end

local allowed = 0
local retry_after = 0

if tokens >= cost then
    tokens = tokens - cost
    allowed = 1
else
    local missing = cost - tokens
    retry_after = math.ceil(missing / rate)
    if retry_after < 1 then
        retry_after = 1
    end
end

redis.call('HMSET', key, 'tokens', tokens, 'last', last)
local ttl = math.ceil(capacity / rate) + 60
redis.call('EXPIRE', key, ttl)

return {allowed, math.floor(tokens), retry_after}
`)

// Result holds the outcome of a rate limit check.
type Result struct {
	Allowed    bool
	Remaining  int
	Capacity   int
	RetryAfter int // in seconds
}

// TokenBucketLimiter applies atomic token-bucket rate limiting backed by Redis.
type TokenBucketLimiter struct {
	rdb *redis.Client
}

// NewTokenBucketLimiter creates a new TokenBucketLimiter.
func NewTokenBucketLimiter(rdb *redis.Client) *TokenBucketLimiter {
	return &TokenBucketLimiter{rdb: rdb}
}

// Allow checks if the action identified by key is permitted given the limit per minute.
func (l *TokenBucketLimiter) Allow(ctx context.Context, action, identifier string, limitPerMinute int) (Result, error) {
	if l.rdb == nil {
		// Redis unavailable: gracefully allow request
		return Result{Allowed: true, Remaining: limitPerMinute, Capacity: limitPerMinute}, nil
	}

	capacity := float64(limitPerMinute)
	ratePerSec := capacity / 60.0
	nowMs := time.Now().UnixNano() / int64(time.Millisecond)
	cost := 1.0

	key := fmt.Sprintf("ratelimit:%s:%s", action, identifier)

	res, err := luaTokenBucket.Run(ctx, l.rdb, []string{key}, ratePerSec, capacity, nowMs, cost).Result()
	if err != nil {
		log.Warn().Err(err).Str("action", action).Str("id", identifier).Msg("rate limit check error; allowing request")
		return Result{Allowed: true, Remaining: limitPerMinute, Capacity: limitPerMinute}, nil
	}

	values, ok := res.([]interface{})
	if !ok || len(values) < 3 {
		return Result{Allowed: true, Remaining: limitPerMinute, Capacity: limitPerMinute}, nil
	}

	allowedInt, _ := values[0].(int64)
	remaining, _ := values[1].(int64)
	retryAfter, _ := values[2].(int64)

	allowed := allowedInt == 1
	if !allowed {
		metrics.RateLimitRejections.WithLabelValues(action).Inc()
	}

	return Result{
		Allowed:    allowed,
		Remaining:  int(remaining),
		Capacity:   limitPerMinute,
		RetryAfter: int(retryAfter),
	}, nil
}
