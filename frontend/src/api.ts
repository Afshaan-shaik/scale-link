export interface Link {
  id: string;
  code: string;
  short_url: string;
  long_url: string;
  click_count: number;
  expires_at?: string;
  created_at: string;
  is_custom: boolean;
  is_expired: boolean;
}

export interface DayStat {
  date: string;
  count: number;
}

export interface CountryStat {
  country: string;
  count: number;
}

export interface DeviceStat {
  device_type: string;
  count: number;
}

export interface ReferrerStat {
  referrer: string;
  count: number;
}

export interface LinkStats {
  code: string;
  total: number;
  per_day: DayStat[];
  countries: CountryStat[];
  devices: DeviceStat[];
  referrers: ReferrerStat[];
}

export interface APIKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used?: string;
  revoked_at?: string;
}

export interface HealthStatus {
  status: string;
  db?: string;
  redis?: string;
  version?: string;
  cache_hit_ratio?: number;
}

// Initial mock seed matching the backend cmd/seed/main.go
export const INITIAL_LINKS: Link[] = [
  {
    id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    code: "gh-repo",
    short_url: `${window.location.origin}/gh-repo`,
    long_url: "https://github.com/scalelink/scalelink",
    click_count: 842,
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    is_custom: true,
    is_expired: false,
  },
  {
    id: "1c2deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6e",
    code: "go-doc",
    short_url: `${window.location.origin}/go-doc`,
    long_url: "https://go.dev/doc/effective_go",
    click_count: 319,
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    is_custom: true,
    is_expired: false,
  },
  {
    id: "2d3deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6f",
    code: "arch-post",
    short_url: `${window.location.origin}/arch-post`,
    long_url: "https://highscalability.com",
    click_count: 154,
    created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    is_custom: true,
    is_expired: false,
  },
  {
    id: "3e4deb4d-3b7d-4bad-9bdd-2b0d7b3dcb70",
    code: "expired-demo",
    short_url: `${window.location.origin}/expired-demo`,
    long_url: "https://example.com/old-page",
    click_count: 42,
    expires_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    is_custom: true,
    is_expired: true,
  },
];

export const INITIAL_STATS: Record<string, LinkStats> = {
  "gh-repo": {
    code: "gh-repo",
    total: 842,
    per_day: [
      { date: "2026-09-28", count: 48 },
      { date: "2026-09-29", count: 96 },
      { date: "2026-09-30", count: 142 },
      { date: "2026-10-01", count: 210 },
      { date: "2026-10-02", count: 186 },
      { date: "2026-10-03", count: 160 },
    ],
    countries: [
      { country: "US", count: 395 },
      { country: "DE", count: 142 },
      { country: "IN", count: 110 },
      { country: "GB", count: 98 },
      { country: "JP", count: 52 },
      { country: "FR", count: 45 },
    ],
    devices: [
      { device_type: "desktop", count: 512 },
      { device_type: "mobile", count: 286 },
      { device_type: "tablet", count: 44 },
    ],
    referrers: [
      { referrer: "https://github.com", count: 412 },
      { referrer: "https://news.ycombinator.com", count: 230 },
      { referrer: "https://twitter.com", count: 120 },
      { referrer: "direct", count: 80 },
    ],
  },
};

// Local storage token helper
export function getToken(): string | null {
  return localStorage.getItem("scalelink_token");
}

export function setToken(token: string) {
  localStorage.setItem("scalelink_token", token);
}

export function clearToken() {
  localStorage.removeItem("scalelink_token");
}

// ── Persistent Link & Analytics Storage ──────────────────────────────────────
const LINKS_KEY = "scalelink_stored_links_v1";
const STATS_KEY = "scalelink_stored_stats_v1";

export function loadStoredLinks(): Link[] {
  try {
    const raw = localStorage.getItem(LINKS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}
  // Default to INITIAL_LINKS on first load
  saveStoredLinks(INITIAL_LINKS);
  return INITIAL_LINKS;
}

export function saveStoredLinks(links: Link[]) {
  try {
    localStorage.setItem(LINKS_KEY, JSON.stringify(links));
  } catch {}
}

export function loadStoredStats(): Record<string, LinkStats> {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}
  saveStoredStats(INITIAL_STATS);
  return INITIAL_STATS;
}

export function saveStoredStats(stats: Record<string, LinkStats>) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {}
}

export function recordLinkClick(code: string): { link?: Link; redirected: boolean; expired: boolean } {
  const links = loadStoredLinks();
  const link = links.find((l) => l.code === code);
  if (!link) {
    return { redirected: false, expired: false };
  }

  // Check expiration
  if (link.expires_at && new Date() > new Date(link.expires_at)) {
    return { link, redirected: false, expired: true };
  }

  // Increment click count
  link.click_count = (link.click_count || 0) + 1;
  saveStoredLinks(links);

  // Update analytics stats
  const statsMap = loadStoredStats();
  const today = new Date().toISOString().slice(0, 10);
  const currentStat = statsMap[code] || {
    code,
    total: 0,
    per_day: [],
    countries: [{ country: "US", count: 0 }],
    devices: [{ device_type: "desktop", count: 0 }],
    referrers: [{ referrer: "direct", count: 0 }],
  };

  currentStat.total += 1;
  const dayEntry = currentStat.per_day.find((d) => d.date === today);
  if (dayEntry) {
    dayEntry.count += 1;
  } else {
    currentStat.per_day.push({ date: today, count: 1 });
  }

  const ua = navigator.userAgent.toLowerCase();
  const deviceType = ua.includes("mobi") ? "mobile" : ua.includes("ipad") || ua.includes("tablet") ? "tablet" : "desktop";
  const devEntry = currentStat.devices.find((d) => d.device_type === deviceType);
  if (devEntry) devEntry.count += 1;
  else currentStat.devices.push({ device_type: deviceType, count: 1 });

  statsMap[code] = currentStat;
  saveStoredStats(statsMap);

  return { link, redirected: true, expired: false };
}

