# ScaleLink Systems Design Document

> **Status:** Production Architecture Specification  
> **Author:** Platform & Distributed Systems Engineering  
> **Target Audience:** Technical Staff / Interviewers (Amazon, Google, Cisco)  
> **Repository:** `github.com/scalelink/scalelink`  

---

## 1. System Requirements & Goals

### 1.1 Functional Requirements
1. **Link Creation:** 
   - Accept a long URL (HTTP/HTTPS, max 2048 characters) and generate a unique, compact 6-character Base62 short code.
   - Support optional custom aliases (3–20 characters, `[A-Za-z0-9_-]`).
   - Support optional expiration timestamps or TTLs (expired links return `410 Gone`).
   - Validate URLs against SSRF (reject private, loopback, link-local IPs and self-referencing hosts).
   - Domain blocklist matching (abuse/malware mitigation).
2. **High-Performance Redirection (Hot Path):**
   - Given a short code `/{code}`, redirect with `302 Found` (or configurable `301 Moved Permanently`) to the target long URL.
   - Ultra-low latency p99 < 15ms via Redis cache-aside.
   - Negative caching for non-existent codes to protect PostgreSQL from cache penetration attacks.
   - Completely non-blocking analytics: redirect path enqueues click events asynchronously to Redis Streams and returns immediately.
3. **Asynchronous Click Analytics:**
   - Record code, timestamp, IP, GeoIP country, device classification (mobile/desktop/tablet/bot), and HTTP referrer.
   - Dedicated consumer worker group with batch commits and Dead Letter Stream (DLQ) for poisoned messages.
   - Aggregated metrics API endpoint: `GET /api/links/{code}/stats` with time-series buckets, top countries, device breakdowns, and referrers.
4. **Security, Accounts & Multi-Tenancy:**
   - User authentication via JWT (access + refresh tokens) and Argon2/bcrypt password hashing.
   - API Key management with SHA-256 key hashing (keys shown once upon creation).
   - Atomic token-bucket rate limiting in Redis (per-IP and per-account).

### 1.2 Non-Functional Requirements
- **Availability:** 99.99% uptime for redirect path.
- **Latency SLA:** Read p50 < 3ms, p95 < 8ms, p99 < 15ms when cached in Redis.
- **Consistency Model:** Strong consistency for link metadata writes and cache updates; eventual consistency for click analytics (acceptable lag < 5s).
- **Graceful Degradation:** The redirect service must function even if Redis crashes (falling back directly to PostgreSQL read replicas) or if the analytics worker lags.

---

## 2. Capacity Estimation & Traffic Math

### 2.1 Scale Targets
* **Read-to-Write Ratio:** `100 : 1` (read-heavy, typical of URL shorteners like bit.ly / tinyurl).
* **Total Link Volume (Storage horizon):** $100\text{ Million (100M)}$ active links over 5 years.
* **New Links Created per Day:**
  $$\frac{100,000,000}{5 \times 365} \approx 54,800\text{ links/day} \approx 0.63\text{ writes/sec (average)}$$
  Peak write throughput: $10 \times \text{average} \approx 6.3\text{ writes/sec}$ (engineered for burst headroom of $1,000\text{ writes/sec}$).
* **Redirects (Reads) per Day:**
  $$54,800 \times 100 = 5,480,000\text{ redirects/day} \approx 63.4\text{ reads/sec (average)}$$
  Peak read throughput: $10 \times \text{average} \approx 634\text{ QPS}$ sustained, with stress target test capacity of $10,000\text{ QPS}$.

### 2.2 Storage Math

#### PostgreSQL: `links` table
* `id` (UUID): 16 bytes
* `code` (VARCHAR(20)): ~8 bytes average
* `long_url` (VARCHAR(2048)): ~100 bytes average
* `user_id` (UUID nullable): 16 bytes
* `created_at`, `updated_at`, `expires_at`, `deleted_at`: $4 \times 8 = 32\text{ bytes}$
* `click_count` (BIGINT): 8 bytes
* `is_custom` (BOOLEAN): 1 byte
* Row overhead + indexes (B-Tree on `code`, `user_id`, `created_at`): ~250 bytes/row total.
$$\text{Storage for 100M links} = 100\text{M} \times 250\text{ bytes} \approx 25\text{ GB (PostgreSQL)}$$

#### PostgreSQL: `click_events` table (Partitioned Monthly)
* Estimated 5.48M clicks/day $\times$ 30 days = $164.4\text{M clicks/month}$.
* Each event row (UUID, code, timestamp, country, device, referrer): ~150 bytes.
* Monthly partition size: $164.4\text{M} \times 150\text{ bytes} \approx 24.6\text{ GB/month}$.
* Click event retention policy: Raw clicks pruned after 90 days; daily rollups retained indefinitely.

#### Redis Memory Sizing (Cache Layer)
* Follow the Pareto 80/20 rule: 20% of hot links generate 80% of read traffic.
* Hot links cached = $20\% \times 100\text{M} = 20\text{M links}$ maximum, or dynamic LRU cache for the top 500,000 hottest URLs in a working set:
  $$500,000 \times (\text{key } 32\text{B} + \text{val } 120\text{B} + \text{Redis overhead } 50\text{B}) \approx 101\text{ MB}$$
* A standard 2GB Redis instance can effortlessly cache over 5,000,000 active URL mappings simultaneously.

---

## 3. Architecture & Data Flow

```mermaid
flowchart TD
    Client(["Client (Browser / Mobile / cURL)"])
    Nginx["Nginx Reverse Proxy & Load Balancer (:8080)"]
    API1["Go API Instance 1"]
    API2["Go API Instance 2"]
    API3["Go API Instance 3"]
    Redis[("Redis 7 (Cache + Streams + RateLimit)")]
    Postgres[("PostgreSQL 16 (Primary DB)")]
    Worker["Analytics Worker Service"]

    Client -->|HTTP /code or /api| Nginx
    Nginx -->|Upstream Round-Robin / LeastConn| API1
    Nginx -->|Upstream Round-Robin / LeastConn| API2
    Nginx -->|Upstream Round-Robin / LeastConn| API3

    API1 -->|1. Check Cache-Aside| Redis
    API1 -.->|2. Cache Miss: Read DB| Postgres
    API1 -.->|3. Populate Cache| Redis
    API1 -->|4. Publish Click Event (Stream)| Redis
    API1 -->|5. Token Bucket Lua| Redis

    Worker -->|XREADGROUP Consumer Group| Redis
    Worker -->|Batch Insert Clicks| Postgres
    Worker -.->|Poison Pill / Retries| Redis
```

---

## 4. Short Code Generation: Trade-Off Analysis

| Scheme | Advantages | Disadvantages | Selection Rationale |
| :--- | :--- | :--- | :--- |
| **Counter-Based + Base62** | Zero collisions; compact codes; fully sequential. | Requires centralized counter coordination (Postgres sequence or Redis `INCR`); predictable URLs allow crawling. | Useful when strict sequence guarantee is needed; rejected here to avoid crawlable predictability. |
| **MD5 / SHA-256 Hash Truncation** | Deterministic (same URL = same code). | High collision probability on 6-character truncation ($62^6 \approx 56.8\text{B}$); deduplication prevents custom links per user. | Rejected due to collision resolution complexity and lack of multi-tenant isolation. |
| **Cryptographic Random Base62 (Chosen)** | Independent per-worker generation (zero coordination overhead); unpredictable (resists enumeration & crawling attacks). | Potential collision on write; requires retry on DB unique violation. | **Selected:** 6 Base62 chars $= 62^6 \approx 5.68 \times 10^{10}$ combinations. At 100M links, collision rate is $<0.18\%$. Handled transparently by bounded exponential backoff retry. |

---

## 5. Cache Strategy & Invalidation

### 5.1 Cache-Aside Pattern
1. **Read Request:** Check key `link:code:{code}` in Redis.
   - **HIT:** Return 302 with header `X-Cache: HIT`.
   - **MISS:** Query PostgreSQL `SELECT long_url, expires_at, deleted_at FROM links WHERE code = $1`.
     - Found: Store in Redis `SET link:code:{code} {long_url} EX 3600`. Return 302 with `X-Cache: MISS`.
     - Not Found: Store negative cache `SET link:neg:{code} 1 EX 300` (5 minutes). Return 404 with `X-Cache: NEGATIVE_HIT`.
2. **Negative Caching:**
   - Protects database from cache penetration (e.g. bots querying non-existent short codes millions of times to exhaust PostgreSQL connections).
3. **Invalidation upon Mutation:**
   - Soft-delete or update: Application issues `DEL link:code:{code}`.
   - Expiration: Handled both by Redis TTL and application-level timestamp check.

---

## 6. Token Bucket Rate Limiting (Atomic Redis Lua)

To prevent race conditions without acquiring distributed locks, rate limiting is implemented via an atomic Redis Lua script:
- Key: `ratelimit:{action}:{identifier}` (e.g., `ratelimit:create:ip:203.0.113.195`).
- Fields: `tokens`, `last_refreshed`.
- Replenishment: Calculates elapsed time since `last_refreshed`, adds proportional tokens up to bucket capacity.
- Response: Returns allowed/rejected boolean, remaining tokens, and time until next token (`Retry-After`).

---

## 7. Failure Modes & Resilience Engineering

| Component Failure | System Behavior & Mitigation |
| :--- | :--- |
| **Redis Crashes** | API logs warning and gracefully falls back to direct PostgreSQL reads. Redirections continue with higher DB load. Click events buffer in local ring buffer until Redis reconnects. |
| **PostgreSQL Unreachable** | Cached links continue to redirect from Redis without interruption ($>90\%$ traffic served). Uncached links and link creation fail with structured 503 Service Unavailable. |
| **Worker Service Lag** | Redis Stream acts as durable buffer (`maxlen` configured). Redirection path latency remains completely unaffected. Worker catches up when load diminishes. |
| **Poison Pill Message in Stream** | Worker retries up to `WORKER_MAX_RETRIES` (3 times). If unprocessable, message is acknowledged and moved to `clicks:dead_letter` for operator inspection. |

---

## 8. Database Schema & Indexing Strategy

```sql
-- Core links table with partial indexes for high query efficiency
CREATE TABLE links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) NOT NULL,
    long_url VARCHAR(2048) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    click_count BIGINT NOT NULL DEFAULT 0,
    is_custom BOOLEAN NOT NULL DEFAULT FALSE
);

-- Fast lookup on redirect (unique constraint creates b-tree index)
CREATE UNIQUE INDEX idx_links_code ON links(code);

-- Partial index for active non-deleted links per user
CREATE INDEX idx_links_user_active ON links(user_id, created_at DESC) 
WHERE deleted_at IS NULL;

-- Monthly partitioned raw click events table
CREATE TABLE click_events (
    id UUID NOT NULL,
    code VARCHAR(20) NOT NULL,
    clicked_at TIMESTAMPTZ NOT NULL,
    country VARCHAR(2),
    device_type VARCHAR(20),
    referrer TEXT,
    ip_address INET,
    user_agent TEXT
) PARTITION BY RANGE (clicked_at);
```
