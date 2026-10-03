package shortcode

import (
	"crypto/rand"
	"math/big"
	"strings"
)

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
const base = int64(len(alphabet)) // 62

// Generate returns a cryptographically-random Base62 string of length n.
// We use crypto/rand to avoid predictability, which is important because
// short codes are effectively public identifiers.
// Trade-off: random is slightly more work than counter-based but eliminates
// coordination between instances. Collision probability for 6-char codes:
// 62^6 = ~56 billion possible codes; at 100M links the collision rate is
// negligible (~0.18%) and we handle it via retry-on-unique-violation.
func Generate(n int) (string, error) {
	b := make([]byte, n)
	for i := range b {
		idx, err := rand.Int(rand.Reader, big.NewInt(base))
		if err != nil {
			return "", err
		}
		b[i] = alphabet[idx.Int64()]
	}
	return string(b), nil
}

// Encode encodes a uint64 counter value to Base62.
// Useful for counter-based generation (coordination via DB sequence).
func Encode(n uint64) string {
	if n == 0 {
		return string(alphabet[0])
	}
	var buf strings.Builder
	for n > 0 {
		buf.WriteByte(alphabet[n%uint64(base)])
		n /= uint64(base)
	}
	// reverse
	s := buf.String()
	runes := []byte(s)
	for i, j := 0, len(runes)-1; i < j; i, j = i+1, j-1 {
		runes[i], runes[j] = runes[j], runes[i]
	}
	return string(runes)
}

// IsValidAlias reports whether s is a valid custom alias:
// 3-20 chars, only [A-Za-z0-9_-].
func IsValidAlias(s string) bool {
	if len(s) < 3 || len(s) > 20 {
		return false
	}
	for _, c := range s {
		if !isAlphanumOrDash(c) {
			return false
		}
	}
	return true
}

func isAlphanumOrDash(c rune) bool {
	return (c >= 'A' && c <= 'Z') ||
		(c >= 'a' && c <= 'z') ||
		(c >= '0' && c <= '9') ||
		c == '_' || c == '-'
}

// ReservedWords are codes that cannot be used as custom aliases because
// they conflict with API routes.
var ReservedWords = map[string]struct{}{
	"api":     {},
	"admin":   {},
	"health":  {},
	"metrics": {},
	"static":  {},
	"favicon.ico": {},
}

// IsReserved reports whether code is a reserved word.
func IsReserved(code string) bool {
	_, ok := ReservedWords[strings.ToLower(code)]
	return ok
}
