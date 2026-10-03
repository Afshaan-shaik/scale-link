package config

import (
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConfig_Defaults(t *testing.T) {
	// Clear any environment overrides
	os.Clearenv()

	cfg, err := Load()
	require.NoError(t, err)

	assert.Equal(t, "http://localhost:8080", cfg.BaseURL)
	assert.Equal(t, "8080", cfg.ServerPort)
	assert.Equal(t, 10*time.Second, cfg.ServerReadTimeout)
	assert.Equal(t, "localhost", cfg.PostgresHost)
	assert.Equal(t, 6, cfg.ShortCodeLength)
	assert.Equal(t, 302, cfg.RedirectStatusCode)
	assert.False(t, cfg.IsProduction())
}

func TestConfig_EnvironmentOverride(t *testing.T) {
	os.Setenv("BASE_URL", "https://short.scale.dev")
	os.Setenv("SERVER_PORT", "9000")
	os.Setenv("ENVIRONMENT", "production")
	os.Setenv("POSTGRES_PASSWORD", "supersecret")
	os.Setenv("REDIRECT_STATUS_CODE", "301")
	defer os.Clearenv()

	cfg, err := Load()
	require.NoError(t, err)

	assert.Equal(t, "https://short.scale.dev", cfg.BaseURL)
	assert.Equal(t, "9000", cfg.ServerPort)
	assert.Equal(t, "production", cfg.Environment)
	assert.Equal(t, 301, cfg.RedirectStatusCode)
	assert.True(t, cfg.IsProduction())
}
