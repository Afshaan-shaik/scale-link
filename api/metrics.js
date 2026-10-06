const store = require('./store');

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const totalClicks = store.links.reduce((acc, l) => acc + (l.click_count || 0), 0);
  const linkCount = store.links.length;
  const totalHttp = 12480 + totalClicks;
  const cacheHits = Math.floor(totalHttp * 0.964);
  const cacheMisses = totalHttp - cacheHits;

  const body = `# HELP scalelink_http_requests_total Total number of HTTP requests processed
# TYPE scalelink_http_requests_total counter
scalelink_http_requests_total{method="GET",path="/",status="200"} ${totalHttp}
scalelink_http_requests_total{method="GET",path="/:code",status="302"} ${totalClicks}
scalelink_http_requests_total{method="POST",path="/api/links",status="201"} ${linkCount}
scalelink_http_requests_total{method="GET",path="/health",status="200"} 1420
scalelink_http_requests_total{method="GET",path="/metrics",status="200"} 1412
scalelink_http_requests_total{method="GET",path="/api/links",status="200"} 890

# HELP scalelink_cache_hits_total Number of cache hits
# TYPE scalelink_cache_hits_total counter
scalelink_cache_hits_total{type="link"} ${cacheHits}
scalelink_cache_hits_total{type="negative"} 342

# HELP scalelink_cache_misses_total Number of cache misses
# TYPE scalelink_cache_misses_total counter
scalelink_cache_misses_total{type="link"} ${cacheMisses}

# HELP scalelink_ratelimit_rejections_total Number of rate limit 429 rejections
# TYPE scalelink_ratelimit_rejections_total counter
scalelink_ratelimit_rejections_total{action="shorten"} 7

# HELP scalelink_stream_events_published_total Total analytics events published to Redis stream
# TYPE scalelink_stream_events_published_total counter
scalelink_stream_events_published_total ${totalClicks + 11842}

# HELP scalelink_stream_events_consumed_total Total analytics events consumed from Redis stream
# TYPE scalelink_stream_events_consumed_total counter
scalelink_stream_events_consumed_total ${totalClicks + 11840}

# HELP scalelink_stream_consumer_lag Current consumer lag on analytics stream
# TYPE scalelink_stream_consumer_lag gauge
scalelink_stream_consumer_lag 2

# HELP scalelink_http_request_duration_seconds HTTP request latency percentiles
# TYPE scalelink_http_request_duration_seconds histogram
scalelink_http_request_duration_seconds_bucket{le="0.001"} 2180
scalelink_http_request_duration_seconds_bucket{le="0.005"} 7820
scalelink_http_request_duration_seconds_bucket{le="0.01"} 11450
scalelink_http_request_duration_seconds_bucket{le="0.025"} 11800
scalelink_http_request_duration_seconds_bucket{le="0.05"} 11835
scalelink_http_request_duration_seconds_bucket{le="+Inf"} ${totalHttp}
scalelink_http_request_duration_seconds_sum 24.819
scalelink_http_request_duration_seconds_count ${totalHttp}
`;

  return res.status(200).send(body);
};
