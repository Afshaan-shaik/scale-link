-- Migration: 001_initial_schema.up.sql
-- ScaleLink initial database schema
-- Designed for high read throughput:
--   * Short codes have a unique index (hot path: single B-tree lookup)
--   * click_events partitioned by month (range scan stays within one partition)
--   * Partial indexes exclude soft-deleted rows from most queries

-- ── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- trigram for ILIKE searches on long_url

-- ── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    email         TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email) WHERE deleted_at IS NULL;

-- ── API Keys ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT        NOT NULL,
    key_hash   TEXT        NOT NULL UNIQUE,
    key_prefix TEXT        NOT NULL,  -- first 8 chars, shown in UI
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used  TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id  ON api_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys (key_hash) WHERE revoked_at IS NULL;

-- ── Links ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS links (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    code        TEXT        NOT NULL UNIQUE,          -- Base62, 6 chars default
    long_url    TEXT        NOT NULL,
    user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
    expires_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ,
    click_count BIGINT      NOT NULL DEFAULT 0,
    is_custom   BOOLEAN     NOT NULL DEFAULT FALSE
);

-- Primary lookup: code → long_url (the hot-path SELECT)
CREATE UNIQUE INDEX IF NOT EXISTS idx_links_code ON links (code);

-- Listing links by owner, excluding deleted
CREATE INDEX IF NOT EXISTS idx_links_user_id    ON links (user_id, created_at DESC) WHERE deleted_at IS NULL;
-- Partial index: only live (non-deleted) links – used by redirect handler
CREATE INDEX IF NOT EXISTS idx_links_code_live  ON links (code) WHERE deleted_at IS NULL;
-- Trigram index for search on long_url
CREATE INDEX IF NOT EXISTS idx_links_long_url_trgm ON links USING GIN (long_url gin_trgm_ops);

-- ── Blocked Domains ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blocked_domains (
    id         SERIAL      PRIMARY KEY,
    domain     TEXT        NOT NULL UNIQUE,
    reason     TEXT        NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blocked_domains_domain ON blocked_domains (domain);

-- ── Click Events (partitioned by month) ──────────────────────────────────────
-- Using declarative range partitioning on timestamp.
-- New partitions must be created monthly (see make partition-create).
-- Trade-off: partitioned table requires partition-aware queries but dramatically
-- improves DELETE (drop old partitions) and query performance (partition pruning).
CREATE TABLE IF NOT EXISTS click_events (
    id          UUID        NOT NULL DEFAULT uuid_generate_v4(),
    code        TEXT        NOT NULL,
    timestamp   TIMESTAMPTZ NOT NULL,
    ip          TEXT        NOT NULL DEFAULT '',
    country     TEXT        NOT NULL DEFAULT 'XX',
    device_type TEXT        NOT NULL DEFAULT 'desktop',
    referrer    TEXT        NOT NULL DEFAULT '',
    user_agent  TEXT        NOT NULL DEFAULT '',
    PRIMARY KEY (id, timestamp)  -- partition key must be in PK
) PARTITION BY RANGE (timestamp);

-- Create partitions for the current and next few months
DO $$
DECLARE
    start_date DATE;
    end_date   DATE;
    partition_name TEXT;
BEGIN
    FOR i IN -1..5 LOOP
        start_date := DATE_TRUNC('month', NOW() + (i || ' months')::INTERVAL)::DATE;
        end_date   := (start_date + INTERVAL '1 month')::DATE;
        partition_name := 'click_events_' || TO_CHAR(start_date, 'YYYY_MM');
        IF NOT EXISTS (
            SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relname = partition_name AND n.nspname = 'public'
        ) THEN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF click_events FOR VALUES FROM (%L) TO (%L)',
                partition_name, start_date, end_date
            );
        END IF;
    END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_click_events_code      ON click_events (code, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_click_events_timestamp ON click_events (timestamp DESC);

-- ── Updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_links_updated_at
    BEFORE UPDATE ON links
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Seed blocked domains ──────────────────────────────────────────────────────
INSERT INTO blocked_domains (domain, reason) VALUES
    ('bit.ly',       'competing shortener'),
    ('tinyurl.com',  'competing shortener'),
    ('t.co',         'competing shortener'),
    ('spam-site.example', 'known spam')
ON CONFLICT (domain) DO NOTHING;
