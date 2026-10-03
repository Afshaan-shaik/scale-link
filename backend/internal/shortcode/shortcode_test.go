package shortcode

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGenerate_Length(t *testing.T) {
	for _, n := range []int{4, 6, 8, 10} {
		code, err := Generate(n)
		require.NoError(t, err)
		assert.Len(t, code, n, "expected length %d got %d", n, len(code))
	}
}

func TestGenerate_Uniqueness(t *testing.T) {
	seen := make(map[string]struct{}, 1000)
	for i := 0; i < 1000; i++ {
		code, err := Generate(6)
		require.NoError(t, err)
		seen[code] = struct{}{}
	}
	// With 62^6 ≈ 56B possibilities, 1000 codes should all be unique.
	assert.Equal(t, 1000, len(seen))
}

func TestGenerate_ValidChars(t *testing.T) {
	code, err := Generate(6)
	require.NoError(t, err)
	for _, c := range code {
		assert.Contains(t, alphabet, string(c))
	}
}

func TestEncode(t *testing.T) {
	tests := []struct {
		input    uint64
		expected string
	}{
		{0, "0"},
		{1, "1"},
		{62, "10"},
		{63, "11"},
		{3844, "100"}, // 62^2
	}
	for _, tt := range tests {
		assert.Equal(t, tt.expected, Encode(tt.input))
	}
}

func TestIsValidAlias(t *testing.T) {
	valid := []string{"abc", "my-link", "my_link", "Link123", "a" + "b" + "c"}
	for _, s := range valid {
		assert.True(t, IsValidAlias(s), "expected %q to be valid", s)
	}
	invalid := []string{
		"ab",           // too short
		"a",            // too short
		"",             // empty
		"this-alias-is-way-too-long-for-the-limit", // too long
		"has space",    // space not allowed
		"has@symbol",   // @ not allowed
		"has.dot",      // dot not allowed
	}
	for _, s := range invalid {
		assert.False(t, IsValidAlias(s), "expected %q to be invalid", s)
	}
}

func TestIsReserved(t *testing.T) {
	reserved := []string{"api", "admin", "health", "metrics", "API", "ADMIN"}
	for _, s := range reserved {
		assert.True(t, IsReserved(s), "expected %q to be reserved", s)
	}
	assert.False(t, IsReserved("mylink"))
}
