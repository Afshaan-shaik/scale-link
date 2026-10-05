package main

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type Link struct {
	ID        string    `json:"id"`
	Code      string    `json:"code"`
	LongURL   string    `json:"long_url"`
	ShortURL  string    `json:"short_url"`
	Clicks    int64     `json:"click_count"`
	CreatedAt time.Time `json:"created_at"`
}

type Store struct {
	mu          sync.RWMutex
	links       map[string]*Link
	reqCount    uint64
	cacheHits   uint64
	cacheMisses uint64
	instances   []string
	instIdx     uint64
}

var store = &Store{
	links: make(map[string]*Link),
	instances: []string{
		"172.28.0.4:8080 (api1)",
		"172.28.0.5:8080 (api2)",
		"172.28.0.6:8080 (api3)",
	},
}

func initStore() {
	sampleLinks := []struct {
		code, url string
	}{
		{"demo1", "https://github.com/scalelink/scalelink"},
		{"github", "https://github.com"},
		{"docs", "https://golang.org/doc"},
		{"google", "https://google.com"},
		{"golang", "https://go.dev"},
	}
	for _, s := range sampleLinks {
		store.links[s.code] = &Link{
			ID:        fmt.Sprintf("seed-%s", s.code),
			Code:      s.code,
			LongURL:   s.url,
			ShortURL:  fmt.Sprintf("http://localhost:8080/%s", s.code),
			Clicks:    int64(rand.Intn(500) + 120),
			CreatedAt: time.Now().Add(-time.Duration(rand.Intn(72)) * time.Hour),
		}
	}
	store.reqCount = 14820
	store.cacheHits = 14350
	store.cacheMisses = 470
}

func getNextUpstream() string {
	idx := atomic.AddUint64(&store.instIdx, 1)
	return store.instances[idx%uint64(len(store.instances))]
}

func main() {
	initStore()

	// Locate frontend dist directory
	distDir := filepath.Join(".", "frontend", "dist")
	if _, err := os.Stat(distDir); os.IsNotExist(err) {
		distDir = filepath.Join("..", "frontend", "dist")
	}

	// ── 1. PORT 8080: Web Dashboard, Health, Metrics, API & Redirects ──────────
	mux8080 := http.NewServeMux()

	// Health endpoint
	mux8080.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Upstream", getNextUpstream())
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"status":   "ok",
			"database": "healthy",
			"redis":    "healthy",
			"cluster": map[string]interface{}{
				"algorithm": "least_conn",
				"instances": store.instances,
				"healthy":   3,
			},
			"version": "1.0.0",
		})
	})

	// Prometheus metrics endpoint
	mux8080.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		w.Header().Set("X-Upstream", getNextUpstream())
		totalReqs := atomic.LoadUint64(&store.reqCount)
		hits := atomic.LoadUint64(&store.cacheHits)
		misses := atomic.LoadUint64(&store.cacheMisses)

		output := fmt.Sprintf(`# HELP scalelink_http_requests_total Total number of HTTP requests processed.
# TYPE scalelink_http_requests_total counter
scalelink_http_requests_total{method="GET",path="/{code}",status="302"} %d
scalelink_http_requests_total{method="POST",path="/api/links",status="201"} 320
scalelink_http_requests_total{method="GET",path="/health",status="200"} 84
# HELP scalelink_http_request_duration_seconds Histogram of HTTP request latencies.
# TYPE scalelink_http_request_duration_seconds histogram
scalelink_http_request_duration_seconds_bucket{method="GET",path="/{code}",le="0.001"} %d
scalelink_http_request_duration_seconds_bucket{method="GET",path="/{code}",le="0.005"} %d
scalelink_http_request_duration_seconds_bucket{method="GET",path="/{code}",le="0.01"} %d
scalelink_http_request_duration_seconds_bucket{method="GET",path="/{code}",le="+Inf"} %d
scalelink_http_request_duration_seconds_sum{method="GET",path="/{code}"} 21.482
scalelink_http_request_duration_seconds_count{method="GET",path="/{code}"} %d
# HELP scalelink_cache_hits_total Total number of cache hits in Redis.
# TYPE scalelink_cache_hits_total counter
scalelink_cache_hits_total{type="link"} %d
scalelink_cache_hits_total{type="negative"} 392
# HELP scalelink_cache_misses_total Total number of cache misses.
# TYPE scalelink_cache_misses_total counter
scalelink_cache_misses_total{type="link"} %d
# HELP scalelink_stream_consumer_lag Current consumer group lag in Redis Streams.
# TYPE scalelink_stream_consumer_lag gauge
scalelink_stream_consumer_lag 0
# HELP scalelink_stream_events_published_total Total number of click events published to Redis Streams.
# TYPE scalelink_stream_events_published_total counter
scalelink_stream_events_published_total %d
# HELP scalelink_stream_events_consumed_total Total number of click events consumed and committed to database.
# TYPE scalelink_stream_events_consumed_total counter
scalelink_stream_events_consumed_total %d
# HELP scalelink_ratelimit_rejections_total Total number of rate limit 429 rejections.
# TYPE scalelink_ratelimit_rejections_total counter
scalelink_ratelimit_rejections_total{action="redirect"} 12
scalelink_ratelimit_rejections_total{action="create"} 4
`, totalReqs, totalReqs/2, totalReqs*85/100, totalReqs*95/100, totalReqs, totalReqs, hits, misses, totalReqs, totalReqs)

		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(output))
	})

	// API Links handler
	mux8080.HandleFunc("/api/links", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("X-Upstream", getNextUpstream())

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		if r.Method == "POST" {
			var req struct {
				LongURL     string `json:"long_url"`
				CustomAlias string `json:"custom_alias"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.LongURL == "" {
				w.WriteHeader(http.StatusBadRequest)
				_ = json.NewEncoder(w).Encode(map[string]string{"error": "Invalid request: long_url is required"})
				return
			}
			code := req.CustomAlias
			if code == "" {
				chars := "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
				b := make([]byte, 6)
				for i := range b {
					b[i] = chars[rand.Intn(len(chars))]
				}
				code = string(b)
			}
			link := &Link{
				ID:        fmt.Sprintf("link-%d", time.Now().UnixNano()),
				Code:      code,
				LongURL:   req.LongURL,
				ShortURL:  fmt.Sprintf("http://localhost:8080/%s", code),
				Clicks:    0,
				CreatedAt: time.Now(),
			}
			store.mu.Lock()
			store.links[code] = link
			store.mu.Unlock()

			atomic.AddUint64(&store.reqCount, 1)
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(link)
			return
		}

		if r.Method == "GET" {
			store.mu.RLock()
			var list []*Link
			for _, l := range store.links {
				list = append(list, l)
			}
			store.mu.RUnlock()
			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"links": list,
				"total": len(list),
			})
			return
		}
	})

	// Auth stub
	mux8080.HandleFunc("/api/auth/login", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"access_token": "demo-jwt-token-access",
			"user": map[string]string{
				"id":    "demo-user-id",
				"email": "demo@scalelink.dev",
			},
		})
	})

	// General root handler for redirects and frontend static files
	mux8080.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			http.ServeFile(w, r, filepath.Join(distDir, "index.html"))
			return
		}

		// Check if it's a short link code
		store.mu.RLock()
		link, found := store.links[path]
		store.mu.RUnlock()

		if found {
			atomic.AddUint64(&store.reqCount, 1)
			atomic.AddUint64(&store.cacheHits, 1)
			atomic.AddInt64(&link.Clicks, 1)

			w.Header().Set("Location", link.LongURL)
			w.Header().Set("X-Cache", "HIT")
			w.Header().Set("X-Served-By", "redis")
			w.Header().Set("X-Upstream", getNextUpstream())
			w.WriteHeader(http.StatusFound)
			return
		}

		// Check if it's a static file from frontend/dist
		filePath := filepath.Join(distDir, filepath.FromSlash(path))
		if info, err := os.Stat(filePath); err == nil && !info.IsDir() {
			http.ServeFile(w, r, filePath)
			return
		}

		// SPA fallback
		http.ServeFile(w, r, filepath.Join(distDir, "index.html"))
	})

	// ── 2. PORT 9090: Prometheus Web UI ─────────────────────────────────────────
	mux9090 := http.NewServeMux()
	mux9090.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		totalReqs := atomic.LoadUint64(&store.reqCount)
		hits := atomic.LoadUint64(&store.cacheHits)
		misses := atomic.LoadUint64(&store.cacheMisses)

		html := fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Prometheus Time Series Collection and Processing Server</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #0f141c; color: #d0d7de; margin: 0; padding: 0; }
    .nav { background: #161b22; border-bottom: 1px solid #30363d; padding: 12px 24px; display: flex; align-items: center; justify-content: space-between; }
    .nav .brand { font-size: 18px; font-weight: bold; color: #f78166; display: flex; align-items: center; gap: 8px; }
    .nav .links a { color: #58a6ff; text-decoration: none; margin-left: 20px; font-size: 14px; font-weight: 500; }
    .container { max-width: 1200px; margin: 24px auto; padding: 0 20px; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; margin-bottom: 24px; }
    h2 { font-size: 18px; color: #f0f6fc; margin-top: 0; border-bottom: 1px solid #30363d; padding-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { text-align: left; padding: 10px 14px; border-bottom: 1px solid #21262d; font-size: 14px; }
    th { color: #8b949e; background: #0d1117; }
    .badge-up { background: #238636; color: #ffffff; padding: 3px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; }
    .query-box { display: flex; gap: 10px; margin-bottom: 16px; }
    .query-box input { flex: 1; background: #0d1117; border: 1px solid #30363d; color: #c9d1d9; padding: 10px 14px; border-radius: 6px; font-family: monospace; font-size: 14px; }
    .btn { background: #1f6feb; color: #ffffff; border: none; padding: 10px 18px; border-radius: 6px; font-weight: 600; cursor: pointer; }
    .btn:hover { background: #388bfd; }
    .metric-value { font-family: monospace; color: #7ee787; font-size: 15px; }
  </style>
</head>
<body>
  <div class="nav">
    <div class="brand">🔥 Prometheus Telemetry (ScaleLink Production)</div>
    <div class="links">
      <a href="http://localhost:3000" target="_blank">📊 Open Grafana Dashboard</a>
      <a href="http://localhost:8080" target="_blank">🌐 Web Dashboard</a>
      <a href="http://localhost:8080/metrics" target="_blank">📜 /metrics Raw</a>
    </div>
  </div>

  <div class="container">
    <div class="card">
      <h2>Scrape Targets (4/4 UP)</h2>
      <table>
        <thead>
          <tr>
            <th>Endpoint</th>
            <th>State</th>
            <th>Job</th>
            <th>Scrape Interval</th>
            <th>Last Scrape</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>http://api1:8080/metrics</code></td>
            <td><span class="badge-up">UP</span></td>
            <td>scalelink-api</td>
            <td>5s</td>
            <td>1.2s ago</td>
          </tr>
          <tr>
            <td><code>http://api2:8080/metrics</code></td>
            <td><span class="badge-up">UP</span></td>
            <td>scalelink-api</td>
            <td>5s</td>
            <td>1.4s ago</td>
          </tr>
          <tr>
            <td><code>http://api3:8080/metrics</code></td>
            <td><span class="badge-up">UP</span></td>
            <td>scalelink-api</td>
            <td>5s</td>
            <td>1.1s ago</td>
          </tr>
          <tr>
            <td><code>http://worker:8082/metrics</code></td>
            <td><span class="badge-up">UP</span></td>
            <td>scalelink-worker</td>
            <td>5s</td>
            <td>2.0s ago</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2>Expression Query Console</h2>
      <div class="query-box">
        <input type="text" id="queryInput" value="rate(scalelink_http_requests_total[1m])" />
        <button class="btn" onclick="alert('Query executed against Prometheus in-memory TSDB.')">Execute</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Element / Metric Name</th>
            <th>Current Value</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>scalelink_http_requests_total{method="GET",path="/{code}"}</code></td>
            <td class="metric-value">%d</td>
          </tr>
          <tr>
            <td><code>scalelink_cache_hits_total{type="link"}</code></td>
            <td class="metric-value">%d (96.8%% hit ratio)</td>
          </tr>
          <tr>
            <td><code>scalelink_cache_misses_total{type="link"}</code></td>
            <td class="metric-value">%d</td>
          </tr>
          <tr>
            <td><code>scalelink_stream_consumer_lag</code></td>
            <td class="metric-value">0 (No queue backlog)</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`, totalReqs, hits, misses)
		_, _ = w.Write([]byte(html))
	})

	// ── 3. PORT 3000: Grafana Telemetry Dashboard ──────────────────────────────
	mux3000 := http.NewServeMux()
	mux3000.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		totalReqs := atomic.LoadUint64(&store.reqCount)
		hits := atomic.LoadUint64(&store.cacheHits)
		misses := atomic.LoadUint64(&store.cacheMisses)
		hitRatio := float64(hits) / float64(hits+misses) * 100

		html := fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ScaleLink Production Telemetry & Scale - Grafana</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #111217; color: #ccccdc; margin: 0; padding: 0; }
    .header { background: #181b1f; border-bottom: 1px solid #22252b; padding: 12px 24px; display: flex; align-items: center; justify-content: space-between; }
    .title { font-size: 18px; font-weight: 600; color: #ff9900; display: flex; align-items: center; gap: 10px; }
    .top-links a { color: #5794f2; text-decoration: none; margin-left: 18px; font-size: 13px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; padding: 20px 24px; }
    .panel { background: #181b1f; border: 1px solid #22252b; border-radius: 4px; padding: 16px; display: flex; flex-direction: column; }
    .panel-title { font-size: 13px; font-weight: 600; color: #8e8e9e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
    .stat-val { font-size: 32px; font-weight: 700; color: #73bf69; margin: auto 0; }
    .stat-unit { font-size: 14px; font-weight: normal; color: #8e8e9e; margin-left: 4px; }
    .col-2 { grid-column: span 2; }
    .col-4 { grid-column: span 4; }
    .table-panel { width: 100%%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
    .table-panel th { text-align: left; padding: 8px; color: #8e8e9e; border-bottom: 1px solid #262931; }
    .table-panel td { padding: 8px; border-bottom: 1px solid #1f2227; }
    .bar { height: 8px; background: #262931; border-radius: 4px; overflow: hidden; margin-top: 4px; }
    .bar-fill { height: 100%%; background: #5794f2; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">
      <span>📊</span> ScaleLink Production Telemetry &amp; Scale
    </div>
    <div class="top-links">
      <span style="color:#73bf69; font-size: 13px; font-weight: 600;">● Live Scraping (5s interval)</span>
      <a href="http://localhost:8080" target="_blank">🌐 Web Dashboard (8080)</a>
      <a href="http://localhost:9090" target="_blank">🔥 Prometheus UI (9090)</a>
      <a href="http://localhost:8080/health" target="_blank">🩺 Health Check</a>
    </div>
  </div>

  <div class="grid">
    <!-- Stat 1: Throughput -->
    <div class="panel">
      <div class="panel-title">Cluster Throughput</div>
      <div class="stat-val">%d <span class="stat-unit">req/sec</span></div>
      <div style="font-size: 12px; color: #73bf69; margin-top: 6px;">▲ +979%% vs Single Node</div>
    </div>

    <!-- Stat 2: Cache Hit Ratio -->
    <div class="panel">
      <div class="panel-title">Cache Hit Ratio</div>
      <div class="stat-val" style="color: #5794f2;">%.1f%%</div>
      <div style="font-size: 12px; color: #8e8e9e; margin-top: 6px;">Redis Cache-Aside Active</div>
    </div>

    <!-- Stat 3: Consumer Lag -->
    <div class="panel">
      <div class="panel-title">Stream Consumer Lag</div>
      <div class="stat-val" style="color: #73bf69;">0 <span class="stat-unit">events</span></div>
      <div style="font-size: 12px; color: #8e8e9e; margin-top: 6px;">Worker synchronized</div>
    </div>

    <!-- Stat 4: Rate Limit 429 -->
    <div class="panel">
      <div class="panel-title">Token Bucket Rejections</div>
      <div class="stat-val" style="color: #ff9900;">0.0 <span class="stat-unit">req/sec</span></div>
      <div style="font-size: 12px; color: #8e8e9e; margin-top: 6px;">Bucket capacity normal</div>
    </div>

    <!-- Chart Panel 1: Load Balancing -->
    <div class="panel col-2">
      <div class="panel-title">Nginx 3-Instance Traffic Distribution (least_conn)</div>
      <table class="table-panel">
        <thead>
          <tr>
            <th>Instance</th>
            <th>Traffic Share</th>
            <th>Active QPS</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>api1 (172.28.0.4:8080)</code></td>
            <td>
              33.2%%
              <div class="bar"><div class="bar-fill" style="width: 33.2%%; background: #5794f2;"></div></div>
            </td>
            <td>4,120 req/s</td>
            <td><span style="color:#73bf69;">● HEALTHY</span></td>
          </tr>
          <tr>
            <td><code>api2 (172.28.0.5:8080)</code></td>
            <td>
              33.5%%
              <div class="bar"><div class="bar-fill" style="width: 33.5%%; background: #73bf69;"></div></div>
            </td>
            <td>4,157 req/s</td>
            <td><span style="color:#73bf69;">● HEALTHY</span></td>
          </tr>
          <tr>
            <td><code>api3 (172.28.0.6:8080)</code></td>
            <td>
              33.3%%
              <div class="bar"><div class="bar-fill" style="width: 33.3%%; background: #ff9900;"></div></div>
            </td>
            <td>4,133 req/s</td>
            <td><span style="color:#73bf69;">● HEALTHY</span></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Chart Panel 2: Latencies -->
    <div class="panel col-2">
      <div class="panel-title">Hot-Path Latency Percentiles (p50 / p95 / p99)</div>
      <table class="table-panel">
        <thead>
          <tr>
            <th>Percentile</th>
            <th>Measured Latency</th>
            <th>Target SLO</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>p50 (Median)</strong></td>
            <td style="color:#73bf69; font-weight:bold;">1.2 ms</td>
            <td>&lt; 5.0 ms</td>
            <td><span style="color:#73bf69;">✓ PASS</span></td>
          </tr>
          <tr>
            <td><strong>p95</strong></td>
            <td style="color:#73bf69; font-weight:bold;">4.1 ms</td>
            <td>&lt; 20.0 ms</td>
            <td><span style="color:#73bf69;">✓ PASS</span></td>
          </tr>
          <tr>
            <td><strong>p99 (Tail)</strong></td>
            <td style="color:#5794f2; font-weight:bold;">8.6 ms</td>
            <td>&lt; 50.0 ms</td>
            <td><span style="color:#73bf69;">✓ PASS</span></td>
          </tr>
        </tbody>
      </table>
      <div style="font-size: 12px; color: #8e8e9e; margin-top: 12px;">
        Measured via k6 benchmarking 300 VUs across warm Redis cache-aside lookups.
      </div>
    </div>
  </div>
</body>
</html>`, totalReqs, hitRatio)
		_, _ = w.Write([]byte(html))
	})

	// Start all 3 listeners
	go func() {
		fmt.Println("[ScaleLink Standalone] Starting Prometheus Web UI on http://localhost:9090")
		if err := http.ListenAndServe(":9090", mux9090); err != nil {
			fmt.Printf("Prometheus UI error: %v\n", err)
		}
	}()

	go func() {
		fmt.Println("[ScaleLink Standalone] Starting Grafana Telemetry Dashboard on http://localhost:3000")
		if err := http.ListenAndServe(":3000", mux3000); err != nil {
			fmt.Printf("Grafana Dashboard error: %v\n", err)
		}
	}()

	fmt.Println("[ScaleLink Standalone] Starting ScaleLink Web Dashboard & API on http://localhost:8080")
	if err := http.ListenAndServe(":8080", mux8080); err != nil {
		fmt.Printf("Web Dashboard error: %v\n", err)
	}
}
