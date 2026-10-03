package stream

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"

	"github.com/scalelink/scalelink/internal/metrics"
	"github.com/scalelink/scalelink/internal/model"
)

// Producer publishes click events to Redis Streams.
type Producer struct {
	rdb        *redis.Client
	streamName string
}

// NewProducer creates a new Redis Streams click event producer.
func NewProducer(rdb *redis.Client, streamName string) *Producer {
	return &Producer{
		rdb:        rdb,
		streamName: streamName,
	}
}

// Publish writes a ClickEvent into the Redis Stream.
func (p *Producer) Publish(ctx context.Context, ev *model.ClickEvent) error {
	if p.rdb == nil {
		return nil
	}

	values := map[string]interface{}{
		"code":        ev.Code,
		"timestamp":   ev.Timestamp.Format(time.RFC3339Nano),
		"ip":          ev.IP,
		"country":     ev.Country,
		"device_type": ev.DeviceType,
		"referrer":    ev.Referrer,
		"user_agent":  ev.UserAgent,
	}

	err := p.rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: p.streamName,
		Values: values,
	}).Err()
	if err == nil {
		metrics.StreamEventsPublished.Inc()
	}
	return err
}

// PublishAsync dispatches a ClickEvent in a background goroutine so the redirect
// handler returns immediately without blocking on Redis I/O.
func (p *Producer) PublishAsync(ev *model.ClickEvent) {
	if p.rdb == nil {
		return
	}

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		if err := p.Publish(ctx, ev); err != nil {
			log.Warn().Err(err).Str("code", ev.Code).Msg("failed to publish click event to stream")
		}
	}()
}
