package analytics

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestParseDeviceType(t *testing.T) {
	tests := []struct {
		name      string
		userAgent string
		expected  string
	}{
		{
			name:      "empty UA defaults to desktop",
			userAgent: "",
			expected:  "desktop",
		},
		{
			name:      "Chrome on macOS desktop",
			userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
			expected:  "desktop",
		},
		{
			name:      "iPhone Safari mobile",
			userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
			expected:  "mobile",
		},
		{
			name:      "Android Chrome mobile",
			userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.88 Mobile Safari/537.36",
			expected:  "mobile",
		},
		{
			name:      "iPad Safari tablet",
			userAgent: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
			expected:  "tablet",
		},
		{
			name:      "Kindle Silk tablet",
			userAgent: "Mozilla/5.0 (Linux; U; Android 4.4.3; en-us; KFTHWI Build/KTU84M) AppleWebKit/537.36 (KHTML, like Gecko) Silk/3.68 like Chrome/39.0.2171.93 Safari/537.36",
			expected:  "tablet",
		},
		{
			name:      "Googlebot crawler",
			userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
			expected:  "bot",
		},
		{
			name:      "Bingbot crawler",
			userAgent: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
			expected:  "bot",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ParseDeviceType(tt.userAgent)
			assert.Equal(t, tt.expected, got)
		})
	}
}

func TestParseCountry(t *testing.T) {
	t.Run("CF-IPCountry header takes precedence", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("CF-IPCountry", "gb")
		assert.Equal(t, "GB", ParseCountry(req))
	})

	t.Run("X-Country-Code header", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("X-Country-Code", "de")
		assert.Equal(t, "DE", ParseCountry(req))
	})

	t.Run("Loopback IP returns XX", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "127.0.0.1:12345"
		assert.Equal(t, "XX", ParseCountry(req))
	})

	t.Run("Private IP in X-Real-IP returns XX", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("X-Real-IP", "192.168.1.50")
		assert.Equal(t, "XX", ParseCountry(req))
	})

	t.Run("Public IP falls back to US", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("X-Real-IP", "8.8.8.8")
		assert.Equal(t, "US", ParseCountry(req))
	})
}
