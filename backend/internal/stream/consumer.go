package stream

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"

	"github.com/scalelink/scalelink/internal/metrics"
	"github.com/scalelink/scalelink/internal/model"
	"github.com/scalelink/scalelink/internal/repository"
)

// ConsumerConfig configures the Redis Streams click worker consumer.
type ConsumerConfig struct {
	StreamName     string
	DeadLetterName string
	GroupName      string
	ConsumerName   string
	BatchSize      int64
	BlockMs        time.Duration
	MaxRetries     int
}

// Consumer consumes click analytics events from Redis Streams,
// batches database writes, tracks retries, and forwards poison-pill events to a DLQ.
type Consumer struct {
	rdb       *redis.Client
	statsRepo *repository.StatsRepository
	cfg       ConsumerConfig
}

// NewConsumer creates a new click event consumer.
func NewConsumer(rdb *redis.Client, statsRepo *repository.StatsRepository, cfg ConsumerConfig) *Consumer {
	if cfg.BatchSize <= 0 {
		cfg.BatchSize = 100
	}
	if cfg.BlockMs <= 0 {
		cfg.BlockMs = 2 * time.Second
	}
	if cfg.MaxRetries <= 0 {
		cfg.MaxRetries = 3
	}
	if cfg.ConsumerName == "" {
		cfg.ConsumerName = fmt.Sprintf("worker-%d", time.Now().UnixNano())
	}
	return &Consumer{
		rdb:       rdb,
		statsRepo: statsRepo,
		cfg:       cfg,
	}
}

// InitGroup ensures the consumer group and stream exist.
func (c *Consumer) InitGroup(ctx context.Context) error {
	err := c.rdb.XGroupCreateMkStream(ctx, c.cfg.StreamName, c.cfg.GroupName, "0").Err()
	if err != nil {
		if strings.Contains(err.Error(), "BUSYGROUP") {
			return nil
		}
		return fmt.Errorf("create consumer group: %w", err)
	}
	log.Info().
		Str("stream", c.cfg.StreamName).
		Str("group", c.cfg.GroupName).
		Msg("created redis stream consumer group")
	return nil
}

// Run starts the consumer loop, blocking until ctx is cancelled.
func (c *Consumer) Run(ctx context.Context) error {
	if err := c.InitGroup(ctx); err != nil {
		return err
	}

	log.Info().
		Str("consumer", c.cfg.ConsumerName).
		Str("group", c.cfg.GroupName).
		Str("stream", c.cfg.StreamName).
		Int64("batch_size", c.cfg.BatchSize).
		Msg("click analytics consumer started")

	claimTicker := time.NewTicker(3 * time.Second)
	defer claimTicker.Stop()

	lagTicker := time.NewTicker(10 * time.Second)
	defer lagTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Info().Msg("consumer context cancelled, stopping worker")
			return nil

		case <-claimTicker.C:
			// Reclaim abandoned/unacknowledged messages from crashed workers
			c.reclaimPending(ctx)

		case <-lagTicker.C:
			c.updateLagMetric(ctx)

		default:
			// Read new messages with XReadGroup
			c.readAndProcess(ctx)
		}
	}
}

// readAndProcess reads new messages (ID: ">") from the stream.
func (c *Consumer) readAndProcess(ctx context.Context) {
	entries, err := c.rdb.XReadGroup(ctx, &redis.XReadGroupArgs{
		Group:    c.cfg.GroupName,
		Consumer: c.cfg.ConsumerName,
		Streams:  []string{c.cfg.StreamName, ">"},
		Count:    c.cfg.BatchSize,
		Block:    c.cfg.BlockMs,
	}).Result()

	if err != nil {
		if err == redis.Nil || ctx.Err() != nil {
			return
		}
		log.Error().Err(err).Msg("error reading from stream")
		time.Sleep(200 * time.Millisecond)
		return
	}

	for _, streamRes := range entries {
		if len(streamRes.Messages) > 0 {
			c.processMessages(ctx, streamRes.Messages)
		}
	}
}

// reclaimPending claims and processes messages that have been pending/unacknowledged
// for >= 1 second (e.g., if a worker crashed or was killed mid-run).
func (c *Consumer) reclaimPending(ctx context.Context) {
	// Query PEL to inspect retry counts for dead-letter routing
	pending, err := c.rdb.XPendingExt(ctx, &redis.XPendingExtArgs{
		Stream: c.cfg.StreamName,
		Group:  c.cfg.GroupName,
		Start:  "-",
		End:    "+",
		Count:  c.cfg.BatchSize,
	}).Result()

	if err != nil && err != redis.Nil {
		log.Warn().Err(err).Msg("failed to query pending stream entries")
		return
	}

	retryMap := make(map[string]int64, len(pending))
	var poisonIDs []string

	for _, p := range pending {
		retryMap[p.ID] = p.RetryCount
		if int(p.RetryCount) > c.cfg.MaxRetries {
			poisonIDs = append(poisonIDs, p.ID)
		}
	}

	// Route poisoned messages exceeding max retries to Dead Letter Stream
	if len(poisonIDs) > 0 {
		c.routeToDeadLetter(ctx, poisonIDs, "max retries exceeded")
	}

	// Claim idle messages from other or crashed consumers
	claimed, _, err := c.rdb.XAutoClaim(ctx, &redis.XAutoClaimArgs{
		Stream:   c.cfg.StreamName,
		Group:    c.cfg.GroupName,
		Consumer: c.cfg.ConsumerName,
		MinIdle:  1 * time.Second,
		Start:    "0-0",
		Count:    c.cfg.BatchSize,
	}).Result()

	if err != nil && err != redis.Nil {
		return
	}

	if len(claimed) > 0 {
		log.Info().Int("count", len(claimed)).Msg("reclaimed pending unacknowledged click events")
		c.processMessages(ctx, claimed)
	}
}

// processMessages decodes stream messages, batches DB writes, and acknowledges.
func (c *Consumer) processMessages(ctx context.Context, messages []redis.XMessage) {
	if len(messages) == 0 {
		return
	}

	validEvents := make([]*model.ClickEvent, 0, len(messages))
	codeCounts := make(map[string]int64)
	ackIDs := make([]string, 0, len(messages))
	var malformedIDs []string

	for _, msg := range messages {
		ev, err := parseClickEvent(msg)
		if err != nil {
			log.Warn().Err(err).Str("id", msg.ID).Msg("malformed click event received")
			malformedIDs = append(malformedIDs, msg.ID)
			continue
		}

		validEvents = append(validEvents, ev)
		codeCounts[ev.Code]++
		ackIDs = append(ackIDs, msg.ID)
	}

	// Route malformed events to DLQ and ACK so they do not block stream
	if len(malformedIDs) > 0 {
		c.routeToDeadLetter(ctx, malformedIDs, "malformed payload")
	}

	if len(validEvents) == 0 {
		return
	}

	// Atomic batch database commit
	timer := prometheus.NewTimer(metrics.WorkerBatchDuration)
	err := c.statsRepo.RecordClickBatch(ctx, validEvents, codeCounts)
	timer.ObserveDuration()

	if err != nil {
		log.Error().Err(err).Int("events", len(validEvents)).Msg("failed to persist click batch to postgres; will retry")
		// Do NOT ACK; messages remain in PEL to be claimed/retried
		return
	}

	// Acknowledge processed messages only after DB transaction commits
	if err := c.rdb.XAck(ctx, c.cfg.StreamName, c.cfg.GroupName, ackIDs...).Err(); err != nil {
		log.Warn().Err(err).Int("count", len(ackIDs)).Msg("failed to XACK processed messages")
	} else {
		metrics.StreamEventsConsumed.Add(float64(len(validEvents)))
	}
}

// routeToDeadLetter forwards poison-pill messages to DLQ and acknowledges them in the main stream.
func (c *Consumer) routeToDeadLetter(ctx context.Context, ids []string, reason string) {
	for _, id := range ids {
		// Fetch message payload
		claimed, err := c.rdb.XRange(ctx, c.cfg.StreamName, id, id).Result()
		var payload map[string]interface{}
		if err == nil && len(claimed) > 0 {
			payload = claimed[0].Values
		} else {
			payload = map[string]interface{}{"raw_id": id}
		}

		payload["_dlq_reason"] = reason
		payload["_dlq_timestamp"] = time.Now().UTC().Format(time.RFC3339)
		payload["_dlq_original_id"] = id

		if err := c.rdb.XAdd(ctx, &redis.XAddArgs{
			Stream: c.cfg.DeadLetterName,
			Values: payload,
		}).Err(); err != nil {
			log.Error().Err(err).Str("id", id).Msg("failed to write to dead letter stream")
		} else {
			metrics.StreamDeadLetterEvents.Inc()
			log.Warn().Str("id", id).Str("reason", reason).Msg("event forwarded to dead letter stream")
		}

		// ACK on the main stream to prevent infinite poison pill loop
		_ = c.rdb.XAck(ctx, c.cfg.StreamName, c.cfg.GroupName, id)
	}
}

// updateLagMetric polls the Redis consumer group lag and records it into Prometheus.
func (c *Consumer) updateLagMetric(ctx context.Context) {
	groups, err := c.rdb.XInfoGroups(ctx, c.cfg.StreamName).Result()
	if err != nil {
		return
	}
	for _, g := range groups {
		if g.Name == c.cfg.GroupName {
			metrics.StreamLag.Set(float64(g.Lag))
			break
		}
	}
}

// parseClickEvent extracts and validates a ClickEvent from a Redis stream message.
func parseClickEvent(msg redis.XMessage) (*model.ClickEvent, error) {
	code, _ := msg.Values["code"].(string)
	if strings.TrimSpace(code) == "" {
		return nil, fmt.Errorf("missing code in stream event")
	}

	var ts time.Time
	if tsStr, ok := msg.Values["timestamp"].(string); ok && tsStr != "" {
		if parsed, err := time.Parse(time.RFC3339Nano, tsStr); err == nil {
			ts = parsed
		} else if parsed, err := time.Parse(time.RFC3339, tsStr); err == nil {
			ts = parsed
		}
	}
	if ts.IsZero() {
		ts = time.Now().UTC()
	}

	ip, _ := msg.Values["ip"].(string)
	country, _ := msg.Values["country"].(string)
	if country == "" {
		country = "XX"
	}
	deviceType, _ := msg.Values["device_type"].(string)
	if deviceType == "" {
		deviceType = "desktop"
	}
	referrer, _ := msg.Values["referrer"].(string)
	userAgent, _ := msg.Values["user_agent"].(string)

	return &model.ClickEvent{
		ID:         msg.ID,
		Code:       code,
		Timestamp:  ts,
		IP:         ip,
		Country:    country,
		DeviceType: deviceType,
		Referrer:   referrer,
		UserAgent:  userAgent,
	}, nil
}
