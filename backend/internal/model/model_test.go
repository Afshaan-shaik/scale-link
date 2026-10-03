package model

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func TestLink_IsExpired(t *testing.T) {
	past := time.Now().Add(-1 * time.Hour)
	future := time.Now().Add(1 * time.Hour)

	t.Run("nil expiry is not expired", func(t *testing.T) {
		link := &Link{
			ID:      uuid.New(),
			Code:    "abc123",
			LongURL: "https://example.com",
		}
		assert.False(t, link.IsExpired())
	})

	t.Run("past expiry is expired", func(t *testing.T) {
		link := &Link{
			ID:        uuid.New(),
			Code:      "abc123",
			LongURL:   "https://example.com",
			ExpiresAt: &past,
		}
		assert.True(t, link.IsExpired())
	})

	t.Run("future expiry is not expired", func(t *testing.T) {
		link := &Link{
			ID:        uuid.New(),
			Code:      "abc123",
			LongURL:   "https://example.com",
			ExpiresAt: &future,
		}
		assert.False(t, link.IsExpired())
	})
}

func TestLink_IsDeleted(t *testing.T) {
	now := time.Now()

	t.Run("nil DeletedAt is not deleted", func(t *testing.T) {
		link := &Link{
			ID:   uuid.New(),
			Code: "active",
		}
		assert.False(t, link.IsDeleted())
	})

	t.Run("non-nil DeletedAt is deleted", func(t *testing.T) {
		link := &Link{
			ID:        uuid.New(),
			Code:      "removed",
			DeletedAt: &now,
		}
		assert.True(t, link.IsDeleted())
	})
}
