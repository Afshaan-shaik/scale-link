import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';

const rateLimitHits = new Rate('scalelink_rate_limit_429');
const rateLimitHeadersValid = new Rate('scalelink_rate_limit_headers_valid');
const totalRequests = new Counter('scalelink_burst_requests');

export const options = {
  // Rapid burst of requests from a single client to trigger token bucket depletion
  scenarios: {
    token_bucket_exhaustion: {
      executor: 'per-vu-iterations',
      vus: 10,
      iterations: 35,
      maxDuration: '30s',
    },
  },
  thresholds: {
    'scalelink_rate_limit_429': ['rate>0.20'], // At least 20% of burst requests should trigger 429
    'scalelink_rate_limit_headers_valid': ['rate>0.95'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

export default function () {
  // Rapid link creation requests without sleep to drain tokens
  const payload = JSON.stringify({
    long_url: 'https://example.com/ratelimit-probe',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      // Consistent client IP simulation
      'X-Forwarded-For': '203.0.113.42',
    },
  };

  const res = http.post(`${BASE_URL}/api/links`, payload, params);
  totalRequests.add(1);

  if (res.status === 429) {
    rateLimitHits.add(1);

    const hasRetryAfter = res.headers['Retry-After'] !== undefined;
    const hasLimit = res.headers['X-Ratelimit-Limit'] !== undefined || res.headers['X-RateLimit-Limit'] !== undefined;

    rateLimitHeadersValid.add(hasRetryAfter && hasLimit ? 1 : 0);

    check(res, {
      'rate limited status is 429': (r) => r.status === 429,
      'has Retry-After header': () => hasRetryAfter,
      'has X-RateLimit headers': () => hasLimit,
    });
  } else {
    rateLimitHits.add(0);
    check(res, {
      'allowed request is 201': (r) => r.status === 201,
    });
  }
}
