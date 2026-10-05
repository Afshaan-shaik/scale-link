import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const createSuccess = new Rate('scalelink_create_success');
const createDuration = new Trend('scalelink_create_duration');

export const options = {
  stages: [
    { duration: '10s', target: 10 }, // Ramp up to 10 VUs
    { duration: '30s', target: 30 }, // Sustained link creation
    { duration: '10s', target: 0 },  // Ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<150'], // 95% link creations under 150ms
    'scalelink_create_success': ['rate>0.95'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

export default function () {
  const rand = Math.floor(Math.random() * 1000000);
  const payload = JSON.stringify({
    long_url: `https://benchmark.scalelink.dev/articles/post-${rand}`,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const start = Date.now();
  const res = http.post(`${BASE_URL}/api/links`, payload, params);
  createDuration.add(Date.now() - start);

  const isSuccess = res.status === 201;
  createSuccess.add(isSuccess ? 1 : 0);

  check(res, {
    'status is 201 Created': (r) => r.status === 201,
    'returned valid short code': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body && body.code && body.code.length >= 6;
      } catch (e) {
        return false;
      }
    },
    'returned short URL': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body && body.short_url && body.short_url.includes(body.code);
      } catch (e) {
        return false;
      }
    },
  });

  sleep(0.1);
}
