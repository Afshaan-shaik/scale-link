package stream

import (
	"context"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/scalelink/scalelink/internal/model"
)

func TestProducer_NilClient(t *testing.T) {
	p := NewProducer(nil, "clicks:events")
	ev := &model.ClickEvent{
		Code:       "test01",
		Timestamp:  time.Now().UTC(),
		IP:         "127.0.0.1",
		Country:    "XX",
		DeviceType: "desktop",
	}

	assert.NotPanics(t, func() {
		err := p.Publish(context.Background(), ev)
		assert.NoError(t, err)
	})

	assert.NotPanics(t, func() {
		p.PublishAsync(ev)
	})
}

func TestParseClickEvent_Valid(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Millisecond)
	msg := redis.XMessage{
		ID: "1600000000000-0",
		Values: map[string]interface{}{
			"code":        "gh-repo",
			"timestamp":   now.Format(time.RFC3339Nano),
			"ip":          "198.51.100.1",
			"country":     "US",
			"device_type": "mobile",
			"referrer":    "https://news.ycombinator.com",
			"user_agent":  "Mozilla/5.0 iPhone",
		},
	}

	ev, err := parseClickEvent(msg)
	require.NoError(t, err)
	assert.Equal(t, "1600000000000-0", ev.ID)
	assert.Equal(t, "gh-repo", ev.Code)
	assert.Equal(t, "198.51.100.1", ev.IP)
	assert.Equal(t, "US", ev.Country)
	assert.Equal(t, "mobile", ev.DeviceType)
	assert.Equal(t, "https://news.ycombinator.com", ev.Referrer)
	assert.Equal(t, "Mozilla/5.0 iPhone", ev.UserAgent)
	assert.True(t, ev.Timestamp.Equal(now))
}

func TestParseClickEvent_Defaults(t *testing.T) {
	msg := redis.XMessage{
		ID: "1600000000001-0",
		Values: map[string]interface{}{
			"code": "demo-code",
		},
	}

	ev, err := parseClickEvent(msg)
	require.NoError(t, err)
	assert.Equal(t, "demo-code", ev.Code)
	assert.Equal(t, "XX", ev.Country)
	assert.Equal(t, "desktop", ev.DeviceType)
	assert.False(t, ev.Timestamp.IsZero())
}

func TestParseClickEvent_MissingCodeFails(t *testing.T) {
	msg := redis.XMessage{
		ID: "1600000000002-0",
		Values: map[string]interface{}{
			"device_type": "desktop",
		},
	}

	_, err := parseClickEvent(msg)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "missing code")
}

func TestNewConsumer_Defaults(t *testing.T) {
	c := NewConsumer(nil, nil, ConsumerConfig{})
	assert.Equal(t, int64(100), c.cfg.BatchSize)
	assert.Equal(t, 2*time.Second, c.cfg.BlockMs)
	assert.Equal(t, 3, c.cfg.MaxRetries)
	assert.NotEmpty(t, c.cfg.ConsumerName)
}

func TestNewConsumer_CustomConfig(t *testing.T) {
	cfg := ConsumerConfig{
		StreamName:     "custom:stream",
		DeadLetterName: "custom:dlq",
		GroupName:      "custom:group",
		ConsumerName:   "worker-test",
		BatchSize:      50,
		BlockMs:        500 * time.Millisecond,
		MaxRetries:     5,
	}
	c := NewConsumer(nil, nil, cfg)
	assert.Equal(t, int64(50), c.cfg.BatchSize)
	assert.Equal(t, 500*time.Millisecond, c.cfg.BlockMs)
	assert.Equal(t, 5, c.cfg.MaxRetries)
	assert.Equal(t, "worker-test", c.cfg.ConsumerName)
}

