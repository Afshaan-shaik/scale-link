package validator

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestValidateURL(t *testing.T) {
	baseURL := "http://localhost:8080"

	t.Run("valid URLs", func(t *testing.T) {
		valid := []string{
			"https://google.com",
			"http://example.com/path?q=1",
			"https://subdomain.example.org/deep/path",
			"https://example.com:8443/path",
		}
		for _, u := range valid {
			assert.NoError(t, ValidateURL(u, baseURL), "expected %q to be valid", u)
		}
	})

	t.Run("rejects non http/https", func(t *testing.T) {
		bad := []string{"ftp://example.com", "file:///etc/passwd", "javascript:alert(1)"}
		for _, u := range bad {
			assert.Error(t, ValidateURL(u, baseURL), "expected %q to be rejected", u)
		}
	})

	t.Run("rejects too long", func(t *testing.T) {
		long := "https://example.com/" + string(make([]byte, 2048))
		assert.Error(t, ValidateURL(long, baseURL))
	})

	t.Run("rejects private IP", func(t *testing.T) {
		assert.Error(t, ValidateURL("http://192.168.1.1/secret", baseURL))
		assert.Error(t, ValidateURL("http://127.0.0.1/secret", baseURL))
		assert.Error(t, ValidateURL("http://10.0.0.1/secret", baseURL))
	})

	t.Run("rejects self-reference", func(t *testing.T) {
		assert.Error(t, ValidateURL("http://localhost:8080/some-code", baseURL))
	})

	t.Run("rejects malformed", func(t *testing.T) {
		assert.Error(t, ValidateURL("not-a-url", baseURL))
		assert.Error(t, ValidateURL("", baseURL))
	})
}

func TestIsBlockedDomain(t *testing.T) {
	blocked := map[string]struct{}{
		"spam.com":    {},
		"phishing.io": {},
	}

	assert.True(t, IsBlockedDomain("https://spam.com/foo", blocked))
	assert.True(t, IsBlockedDomain("https://sub.spam.com/foo", blocked))
	assert.False(t, IsBlockedDomain("https://google.com", blocked))
	assert.False(t, IsBlockedDomain("https://notspam.com", blocked))
}
