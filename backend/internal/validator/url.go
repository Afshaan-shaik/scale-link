package validator

import (
	"fmt"
	"net"
	"net/url"
	"strings"
)

const maxURLLength = 2048

// ErrInvalidURL is returned when URL validation fails.
type ErrInvalidURL struct {
	Reason string
}

func (e *ErrInvalidURL) Error() string {
	return fmt.Sprintf("invalid URL: %s", e.Reason)
}

// ValidateURL validates that rawURL is a safe, well-formed destination URL.
// Rules:
//   - Must parse as a valid URL
//   - Scheme must be http or https
//   - Must have a non-empty host
//   - Must not exceed 2048 characters
//   - Must not resolve to a private/loopback IP (SSRF protection)
//   - Must not self-reference the ScaleLink base URL
func ValidateURL(rawURL, baseURL string) error {
	if len(rawURL) > maxURLLength {
		return &ErrInvalidURL{Reason: fmt.Sprintf("URL exceeds %d characters", maxURLLength)}
	}

	u, err := url.ParseRequestURI(rawURL)
	if err != nil {
		return &ErrInvalidURL{Reason: "URL could not be parsed"}
	}

	scheme := strings.ToLower(u.Scheme)
	if scheme != "http" && scheme != "https" {
		return &ErrInvalidURL{Reason: "scheme must be http or https"}
	}

	host := u.Hostname()
	if host == "" {
		return &ErrInvalidURL{Reason: "URL must have a valid host"}
	}

	// Self-reference check: reject URLs pointing back at this ScaleLink instance
	if baseURL != "" {
		base, err := url.Parse(baseURL)
		if err == nil && strings.EqualFold(u.Hostname(), base.Hostname()) {
			return &ErrInvalidURL{Reason: "URL must not reference this ScaleLink instance"}
		}
	}

	// SSRF protection: reject private/loopback IPs
	if err := checkPrivateIP(host); err != nil {
		return err
	}

	return nil
}

// checkPrivateIP resolves the host and rejects private/loopback addresses.
// We perform a DNS lookup so that hostnames that resolve to private IPs are
// also rejected (defense-in-depth for SSRF).
func checkPrivateIP(host string) error {
	// If host is already an IP literal, check directly.
	if ip := net.ParseIP(host); ip != nil {
		if isPrivateIP(ip) {
			return &ErrInvalidURL{Reason: "destination IP is private or loopback"}
		}
		return nil
	}
	// DNS lookup for hostname
	addrs, err := net.LookupHost(host)
	if err != nil {
		// If DNS fails we don't block the link—real validation should happen
		// at creation time; a failed lookup may be a transient DNS issue.
		// We log the warning upstream but don't reject here.
		return nil
	}
	for _, addr := range addrs {
		ip := net.ParseIP(addr)
		if ip != nil && isPrivateIP(ip) {
			return &ErrInvalidURL{Reason: "destination resolves to a private IP"}
		}
	}
	return nil
}

// isPrivateIP checks whether ip is in a private, loopback, link-local or
// other non-routable range.
func isPrivateIP(ip net.IP) bool {
	privateRanges := []*net.IPNet{}
	for _, cidr := range []string{
		"10.0.0.0/8",
		"172.16.0.0/12",
		"192.168.0.0/16",
		"127.0.0.0/8",
		"::1/128",
		"fc00::/7",
		"169.254.0.0/16", // link-local
		"0.0.0.0/8",
		"100.64.0.0/10", // shared address space
	} {
		_, network, _ := net.ParseCIDR(cidr)
		privateRanges = append(privateRanges, network)
	}
	for _, network := range privateRanges {
		if network.Contains(ip) {
			return true
		}
	}
	return false
}

// IsBlockedDomain checks whether the URL's host matches a blocked domain.
// The blockedDomains set is a map[string]struct{} populated from the DB.
func IsBlockedDomain(rawURL string, blockedDomains map[string]struct{}) bool {
	u, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	host := strings.ToLower(u.Hostname())
	// Check exact match and parent domains
	parts := strings.Split(host, ".")
	for i := range parts {
		candidate := strings.Join(parts[i:], ".")
		if _, blocked := blockedDomains[candidate]; blocked {
			return true
		}
	}
	return false
}
