package analytics

import (
	"net"
	"net/http"
	"strings"
)

// ParseDeviceType inspects User-Agent string and classifies into mobile/tablet/desktop/bot.
func ParseDeviceType(userAgent string) string {
	ua := strings.ToLower(userAgent)
	if ua == "" {
		return "desktop"
	}

	// 1. Bots & crawlers
	bots := []string{"bot", "crawler", "spider", "slurp", "googlebot", "bingbot", "yandex", "duckduckbot", "baiduspider", "facebookexternalhit"}
	for _, b := range bots {
		if strings.Contains(ua, b) {
			return "bot"
		}
	}

	// 2. Tablets
	tablets := []string{"ipad", "tablet", "playbook", "silk", "kindle"}
	for _, t := range tablets {
		if strings.Contains(ua, t) {
			return "tablet"
		}
	}

	// 3. Mobile
	mobiles := []string{"mobile", "android", "iphone", "ipod", "blackberry", "windows phone", "opera mini", "iemobile"}
	for _, m := range mobiles {
		if strings.Contains(ua, m) {
			return "mobile"
		}
	}

	// 4. Default to desktop
	return "desktop"
}

// ParseCountry extracts country ISO 3166-1 alpha-2 code from headers or fallback.
func ParseCountry(r *http.Request) string {
	// 1. Cloudflare / CDN headers
	if c := r.Header.Get("CF-IPCountry"); c != "" && len(c) == 2 {
		return strings.ToUpper(c)
	}
	if c := r.Header.Get("X-Country-Code"); c != "" && len(c) == 2 {
		return strings.ToUpper(c)
	}

	// 2. Check for private/loopback IP
	ipStr := r.Header.Get("X-Real-IP")
	if ipStr == "" {
		ipStr, _, _ = net.SplitHostPort(r.RemoteAddr)
		if ipStr == "" {
			ipStr = r.RemoteAddr
		}
	}
	ip := net.ParseIP(ipStr)
	if ip == nil || ip.IsLoopback() || ip.IsPrivate() {
		return "XX" // Internal / Localhost testing
	}

	return "US" // Default fallback for public IPs when local MaxMind DB is unmounted
}
