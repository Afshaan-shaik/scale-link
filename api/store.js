// Shared serverless memory store for ScaleLink production deployment on Vercel
const INITIAL_DEMO_LINK = {
  id: "scale-link-demo-1",
  code: "gh-repo",
  short_url: "https://scale-link-six.vercel.app/gh-repo",
  long_url: "https://github.com/Afshaan-shaik/scale-link",
  click_count: 842,
  created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  is_custom: true,
  is_expired: false,
};

// Global cache across serverless function invocations
if (!global.__SCALELINK_STORE__) {
  global.__SCALELINK_STORE__ = {
    links: [INITIAL_DEMO_LINK],
    stats: {
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
    },
  };
}

module.exports = global.__SCALELINK_STORE__;
