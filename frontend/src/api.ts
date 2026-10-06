import { getSessionToken, sessionFetch, getWorkspaceId } from './session';

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

// Clean demo example link for first-time visitors when workspace is brand new
export const INITIAL_LINKS: Link[] = [
  {
    id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    code: "gh-repo",
    short_url: `${typeof window !== 'undefined' ? window.location.origin : 'https://scale-link-six.vercel.app'}/gh-repo`,
    long_url: "https://github.com/Afshaan-shaik/scale-link",
    click_count: 842,
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    is_custom: true,
    is_expired: false,
  },
];

export const INITIAL_STATS: Record<string, LinkStats> = {
  "gh-repo": {
    code: "gh-repo",
    total: 842,
    per_day: [
      { date: "2026-10-01", count: 210 },
      { date: "2026-10-02", count: 186 },
      { date: "2026-10-03", count: 160 },
      { date: "2026-10-04", count: 142 },
      { date: "2026-10-05", count: 96 },
      { date: "2026-10-06", count: 48 },
    ],
    countries: [
      { country: "US", count: 395 },
      { country: "IN", count: 180 },
      { country: "DE", count: 142 },
      { country: "GB", count: 98 },
      { country: "JP", count: 27 },
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

// ── Tab-Scoped Isolated Workspace Store (sessionStorage only, strictly isolated per tab/device) ──
const TAB_LINKS_KEY = 'scalelink_tab_links_cache';
const TAB_STATS_KEY = 'scalelink_tab_stats_cache';

export function loadStoredLinks(): Link[] {
  try {
    const rawTab = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(TAB_LINKS_KEY) : null;
    if (rawTab) {
      const parsed = JSON.parse(rawTab);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {}
  return [];
}

export function saveStoredLinks(links: Link[]) {
  try {
    const json = JSON.stringify(links);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(TAB_LINKS_KEY, json);
    }
  } catch {}
}

export function loadStoredStats(): Record<string, LinkStats> {
  try {
    const rawTab = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(TAB_STATS_KEY) : null;
    if (rawTab) {
      return JSON.parse(rawTab);
    }
  } catch {}
  return INITIAL_STATS;
}

export function saveStoredStats(stats: Record<string, LinkStats>) {
  try {
    const json = JSON.stringify(stats);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(TAB_STATS_KEY, json);
    }
  } catch {}
}

/**
 * Fetch Saved URLs for this isolated workspace from the server.
 */
export async function fetchWorkspaceLinks(): Promise<Link[]> {
  try {
    const res = await sessionFetch('/api/links');
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.links)) {
        const local = loadStoredLinks();
        const map = new Map<string, Link>();
        // Add server links for this workspace
        for (const l of data.links) {
          map.set(l.code, l);
        }
        // Preserve any links created in this tab that haven't reached server yet
        for (const l of local) {
          if (!map.has(l.code)) {
            map.set(l.code, l);
          }
        }
        const merged = Array.from(map.values());
        saveStoredLinks(merged);
        return merged;
      }
    }
  } catch {}
  return loadStoredLinks();
}

/**
 * Soft delete a link belonging to this workspace.
 */
export async function deleteWorkspaceLink(id: string): Promise<boolean> {
  try {
    const res = await sessionFetch(`/api/links/${id}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch owner stats for a link belonging to this workspace.
 */
export async function fetchLinkStats(code: string): Promise<LinkStats | null> {
  try {
    const res = await sessionFetch(`/api/links/${encodeURIComponent(code)}/stats`);
    if (res.ok) {
      return await res.json();
    }
  } catch {}
  return null;
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
  const deviceType = ua.includes("mobile") ? "mobile" : ua.includes("ipad") || ua.includes("tablet") ? "tablet" : "desktop";
  const devEntry = currentStat.devices.find((d) => d.device_type === deviceType);
  if (devEntry) devEntry.count += 1;
  else currentStat.devices.push({ device_type: deviceType, count: 1 });

  statsMap[code] = currentStat;
  saveStoredStats(statsMap);

  return { link, redirected: true, expired: false };
}
