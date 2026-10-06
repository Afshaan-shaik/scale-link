# ⚡ ScaleLink

> High-throughput, production-grade URL shortener with asynchronous click analytics, sub-millisecond Redis caching, atomic token-bucket rate limiting, and real-time observability. Engineered for interview-grade systems design depth.

[![GitHub Repo](https://img.shields.io/badge/GitHub-Afshaan--shaik%2Fscale--link-blue?logo=github)](https://github.com/Afshaan-shaik/scale-link)
[![Docker Compose](https://img.shields.io/badge/docker--compose-v2.20+-blue.svg)](docker-compose.yml)
[![Terraform IaC](https://img.shields.io/badge/IaC-Terraform%20AWS-orange.svg)](infra/terraform/)
[![Architecture & Pitch Guide PDF](https://img.shields.io/badge/Guide-Architecture%20%26%20Pitch%20PDF-success.svg)](docs/ScaleLink_Beginners_Guide_and_Pitch.pdf)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> 📘 **Architectural Guide & Pitch:** See the [Beginner Developer's Engineering Guide & Project Pitch](docs/BEGINNER_GUIDE_AND_PITCH.md) or download the formatted [PDF Guide](docs/ScaleLink_Beginners_Guide_and_Pitch.pdf).

---

## 🏗️ Architecture

```mermaid
flowchart TD
    subgraph Clients["Clients"]
        Browser["Desktop & Mobile Web (PWA)"]
        Phone["Phone (LAN Wi-Fi / Tunnel)"]
        cURL["API Consumers / cURL"]
    end

    subgraph Edge["Reverse Proxy & Load Balancer"]
        Nginx["Nginx Reverse Proxy (:8080)<br/>• Static PWA Assets<br/>• Upstream Round-Robin / LeastConn<br/>• Structured JSON Access Logs<br/>• Header Propagation (X-Cache)"]
    end

    subgraph Compute["Go Backend Services"]
        API1["Go API Node 1 (Chi Router)"]
        API2["Go API Node 2 (Chi Router)"]
        API3["Go API Node 3 (Chi Router)"]
        Worker["Async Click Worker<br/>(Consumer Group / DLQ)"]
    end

    subgraph Data["Storage & Messaging Layer"]
        Redis[("Redis 7<br/>• Cache-Aside (TTL + Negative)<br/>• Token-Bucket Lua Scripts<br/>• Redis Streams (clicks:events)")]
        Postgres[("PostgreSQL 16<br/>• Users & API Keys<br/>• Links (Partial Indexes)<br/>• click_events (Monthly Partitioned)")]
    end

    subgraph Telemetry["Observability"]
        Prometheus["Prometheus (:9090)<br/>• Scrapes /metrics"]
        Grafana["Grafana (:3000)<br/>• Provisioned Dashboards"]
    end

    Clients -->|HTTP :8080| Nginx
    Nginx -->|/api/* and /{code}| API1 & API2 & API3
    API1 & API2 & API3 -->|Cache-Aside & Rate Limiting| Redis
    API1 & API2 & API3 -.->|DB Read/Write| Postgres
    API1 & API2 & API3 -->|XADD non-blocking click| Redis
    Worker -->|XREADGROUP batch| Redis
    Worker -->|Batch Insert Clicks| Postgres
    Prometheus -->|Scrape| API1
    Grafana -->|Query| Prometheus
```

---

## 🚀 Quick Start (One Command)

### Prerequisites
- Docker Engine & Docker Compose (v2.20+)

### 1. Launch Environment
```bash
# Clone the repository
git clone https://github.com/Afshaan-shaik/scale-link.git
cd scale-link

# Copy sample environment configuration
cp .env.example .env

# Build and start all services
docker compose up -d --build
```
Nginx will start listening on `http://localhost:8080`.

### 2. Seed Sample Data (First-Run Experience)
Populate the database with a demo account, realistic short links, and backdated click analytics:
```bash
make seed
# Or with docker compose directly:
docker compose run --rm api /seed
```

Demo Credentials:
- **Email:** `demo@scalelink.dev`
- **Password:** `Demo1234!`

### 3. Run Automated Smoke Tests
Validate full system integrity (creation, 302 redirect, negative caching, expired link 410, and rate limiting):
```bash
make smoke
# Or on Windows PowerShell:
.\scripts\smoke.ps1
```

---

## 📱 Using ScaleLink from Your Phone (Same Wi-Fi)

ScaleLink is fully responsive and installable as a Progressive Web App (PWA) on iOS and Android.

### Step 1: Find your PC's LAN IP
- **Windows:** Run `ipconfig` and find your IPv4 address (e.g. `192.168.1.150`).
- **macOS / Linux:** Run `ip a` or `ifconfig` (e.g. `192.168.1.150`).

### Step 2: Update `.env`
Change `BASE_URL` in `.env`:
```env
BASE_URL=http://192.168.1.150:8080
```
Then restart Nginx and the API:
```bash
docker compose up -d --force-recreate
```

### Step 3: Windows Firewall Rule (Windows Users Only)
Allow inbound traffic on port 8080 in an Administrator PowerShell prompt:
```powershell
New-NetFirewallRule -DisplayName "ScaleLink 8080" -Direction Inbound -LocalPort 8080 -Protocol TCP -Action Allow
```

### Step 4: Open on Your Phone
1. Connect your phone to the same Wi-Fi network.
2. Open your phone's browser and navigate to `http://192.168.1.150:8080`.
3. Add to Home Screen to install as a native PWA app.

*(Optional)* **Public Tunnel via Cloudflare:**
```bash
cloudflared tunnel --url http://localhost:8080
```

---

## 🚶 Walkthrough: Shorten Your First URL

1. **Access the Dashboard:** Open `http://localhost:8080` in your browser.
2. **Input Destination URL:** Paste any valid URL (e.g. `https://github.com/scalelink/scalelink`).
3. **Optional Custom Alias:** Enter a custom code (e.g. `interview-demo`).
4. **Optional Expiry:** Set a validity window or leave blank for persistent links.
5. **Click Shorten:**
   - Instant response with working short link: `http://localhost:8080/interview-demo`.
6. **Copy & Visit:**
   - Click **Copy** to place the URL on your clipboard.
   - Click **Open** to trigger the real HTTP 302 redirect.
7. **View Analytics:**
   - Navigate to `/api/links/interview-demo/stats` or view the live charts in the dashboard.

---

## 📡 REST API Reference

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/links` | Create a new short link | Optional |
| `GET` | `/{code}` | Hot-path redirect (302) | None |
| `GET` | `/api/links` | List user's links (paginated) | Bearer JWT / API Key |
| `GET` | `/api/links/{code}` | Get link metadata | Bearer JWT / API Key |
| `PATCH` | `/api/links/{id}` | Update link expiry | Bearer JWT / API Key |
| `DELETE`| `/api/links/{id}` | Soft-delete link & invalidate cache | Bearer JWT / API Key |
| `GET` | `/api/links/{code}/stats` | Aggregate click statistics | Bearer JWT / API Key |
| `POST` | `/api/auth/register` | Register new user account | None |
| `POST` | `/api/auth/login` | Authenticate & get JWT tokens | None |
| `POST` | `/api/auth/refresh` | Refresh expired access token | None |
| `POST` | `/api/keys` | Generate new API key | Bearer JWT |
| `GET` | `/health` | Liveness & readiness probes | None |
| `GET` | `/metrics` | Prometheus metrics endpoint | None |

---

## 📊 Observability & Telemetry (Phase 5)

ScaleLink includes a production-grade observability suite with Prometheus and pre-provisioned Grafana dashboards:

### 1. Prometheus Metrics (`http://localhost:9090`)
- Scrapes metrics every 5s from all 3 API nodes (`api1`, `api2`, `api3`) and the async click `worker`.
- Metrics include:
  - `scalelink_http_requests_total{method, path, status}`
  - `scalelink_http_request_duration_seconds{method, path}`
  - `scalelink_cache_hits_total{type="link|negative"}`
  - `scalelink_cache_misses_total{type="link"}`
  - `scalelink_ratelimit_rejections_total{action}`
  - `scalelink_stream_events_published_total`
  - `scalelink_stream_events_consumed_total`
  - `scalelink_stream_consumer_lag`
  - `scalelink_worker_batch_duration_seconds`

### 2. Grafana Production Dashboard (`http://localhost:3000`)
- **Credentials:** Username: `admin` | Password: `admin` (configured in `.env`)
- Pre-provisioned dashboard: **ScaleLink Production Telemetry & Scale**
- **Panels:**
  - Cluster Throughput (Total QPS)
  - Cache Hit Ratio Gauge (95%+ Target)
  - Stream Consumer Lag & Dead Letter Events
  - Token Bucket 429 Rejections by Action
  - 3-Instance Traffic Balance (verifying Nginx `least_conn` distribution)
  - Redirect Latency Percentiles (**p50 = 1.2ms, p95 = 4.1ms, p99 = 8.6ms**)
  - Worker Database Batch Insertion Duration

---

## ⚡ Load Testing with k6

ScaleLink includes automated load testing scenarios in `/loadtest`:

```bash
# 1. Hot-path redirect benchmark (100:1 read-to-write ratio, cache hit vs miss)
make loadtest
# On Windows PowerShell:
.\scripts\loadtest.ps1 -Target redirect

# 2. Short link creation throughput benchmark
make loadtest-create
# On Windows PowerShell:
.\scripts\loadtest.ps1 -Target create

# 3. Burst token-bucket rate limit exhaustion benchmark
make loadtest-ratelimit
# On Windows PowerShell:
.\scripts\loadtest.ps1 -Target ratelimit
```

See [docs/PERFORMANCE.md](file:///d:/Scale%20link/docs/PERFORMANCE.md) for full benchmark results, latency distributions, and bottleneck analysis.

---

## 🛠️ Verification & Testing Commands

```bash
# Run unit and integration tests
make test

# Run code linter
make lint

# Run end-to-end smoke tests
make smoke

# Run Phase 3 async worker verification (1,000 events zero loss)
make verify-phase3

# Run k6 load test suite
make loadtest
```

---

## 📂 Repository Structure

```
scalelink/
├── backend/
│   ├── cmd/
│   │   ├── api/             # HTTP API entrypoint
│   │   ├── worker/          # Async Redis Streams click consumer
│   │   └── seed/            # Seed data generator
│   ├── internal/
│   │   ├── config/          # Environment configuration
│   │   ├── db/              # Postgres connection pool & embedded migrations
│   │   ├── handler/         # HTTP Chi handlers (link, auth, apikey, health)
│   │   ├── middleware/      # Logger, RealIP, Auth, Recoverer
│   │   ├── model/           # Domain entities & DTOs
│   │   ├── repository/      # pgx database queries & batch operations
│   │   ├── service/         # Business logic (link, auth, stats)
│   │   ├── shortcode/       # Base62 crypto generator & alias validator
│   │   └── validator/       # URL validation & SSRF/loopback protection
│   ├── migrations/          # golang-migrate SQL migrations
│   ├── Dockerfile           # Multi-stage Go 1.22 build
│   └── go.mod
├── nginx/
│   ├── nginx.conf           # Load balancing, security headers, X-Cache propagation
│   └── Dockerfile
├── docs/
│   ├── DESIGN.md            # Systems design, capacity math, trade-offs
│   └── PERFORMANCE.md       # Benchmarks, p50/p95/p99 latency
├── scripts/
│   ├── smoke.sh             # Bash automated smoke suite
│   └── smoke.ps1            # PowerShell automated smoke suite
├── docker-compose.yml       # Production Compose specification
├── Makefile                 # Standard developer interface
├── .env.example             # Documented default settings
└── README.md
```
