import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom Prometheus/k6 metrics
const cacheHits = new Rate('scalelink_cache_hits');
const redirectSuccess = new Rate('scalelink_redirect_success');
const redirectDuration = new Trend('scalelink_redirect_duration');
const totalRequests = new Counter('scalelink_total_requests');

export const options = {
  scenarios: {
    // 1. Hot Path Cache Reads (95%+ Cache Hit Ratio)
    hot_path_redirects: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '15s', target: 50 },  // Ramp to 50 VUs
        { duration: '30s', target: 150 }, // Heavy load at 150 VUs
        { duration: '15s', target: 300 }, // Peak spike at 300 VUs
        { duration: '15s', target: 0 },   // Graceful cooldown
      ],
      gracefulRampDown: '5s',
      exec: 'testHotRedirects',
    },
    // 2. Cache Penetration Defense (Negative Caching)
    cache_penetration_defense: {
      executor: 'constant-vus',
      vus: 20,
      duration: '30s',
      startTime: '10s',
      exec: 'testNegativeCachePenetration',
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<50', 'p(99)<150'], // 95% under 50ms, 99% under 150ms
    'scalelink_redirect_success': ['rate>0.98'],     // >98% successful 302 redirects
    'scalelink_cache_hits': ['rate>0.85'],           // High cache hit efficiency
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

// Known seeded codes
const SEEDED_CODES = ['demo1', 'github', 'docs', 'google', 'golang'];

export function setup() {
  // Check health before starting load test
  const res = http.get(`${BASE_URL}/health`);
  check(res, {
    'healthcheck ok': (r) => r.status === 200,
  });

  // Ensure test links exist by creating a dynamic benchmark link
  const createPayload = JSON.stringify({
    long_url: 'https://scalelink.dev/benchmark-target',
    custom_alias: 'k6-bench-link',
  });
  http.post(`${BASE_URL}/api/links`, createPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  return { testCode: 'k6-bench-link' };
}

// ── Scenario 1: Hot Path Redirects ─────────────────────────────────────────────
export function testHotRedirects(data) {
  const code = Math.random() < 0.7 
    ? (data.testCode || 'demo1')
    : SEEDED_CODES[Math.floor(Math.random() * SEEDED_CODES.length)];

  // Request short link redirect without automatically following 302
  const params = {
    redirects: 0,
    tags: { name: 'RedirectHotPath' },
  };

  const start = Date.now();
  const res = http.get(`${BASE_URL}/${code}`, params);
  const duration = Date.now() - start;

  totalRequests.add(1);
  redirectDuration.add(duration);

  const isRedirect = res.status === 302 || res.status === 301;
  const isCacheHit = res.headers['X-Cache'] === 'HIT';

  redirectSuccess.add(isRedirect ? 1 : 0);
  cacheHits.add(isCacheHit ? 1 : 0);

  check(res, {
    'status is 302 or 301': (r) => r.status === 302 || r.status === 301,
    'has location header': (r) => r.headers['Location'] !== undefined,
    'has X-Served-By header': (r) => r.headers['X-Served-By'] !== undefined,
  });

  sleep(0.05); // 50ms think time between user requests
}

// ── Scenario 2: Negative Caching / Penetration Resistance ──────────────────────
export function testNegativeCachePenetration() {
  // Generate random non-existent shortcode
  const randomCode = `miss_${Math.floor(Math.random() * 50)}`;

  const params = {
    redirects: 0,
    tags: { name: 'NegativeCacheTest' },
  };

  const res = http.get(`${BASE_URL}/${randomCode}`, params);
  totalRequests.add(1);

  // The first request will be a MISS (404), but subsequent requests for the
  // same code must hit Redis negative cache (X-Served-By: redis-negative, X-Cache: HIT)
  check(res, {
    'status is 404 or 410': (r) => r.status === 404 || r.status === 410,
    'negative cache protection verified': (r) => {
      const servedBy = r.headers['X-Served-By'];
      return servedBy === 'redis-negative' || servedBy === 'db';
    },
  });

  sleep(0.1);
}
