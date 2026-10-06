-- Migration: 002_anonymous_workspaces.up.sql
-- ScaleLink anonymous workspaces, sessions, and secure transfer tokens

-- ── Workspaces ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspaces (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status     TEXT        NOT NULL DEFAULT 'active'
);

CREATE TRIGGER trg_workspaces_updated_at
    BEFORE UPDATE ON workspaces
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Sessions ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    token_hash   TEXT        NOT NULL UNIQUE, -- SHA-256 hex of high-entropy token
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked_at   TIMESTAMPTZ,
    status       TEXT        NOT NULL DEFAULT 'active'
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash   ON sessions (token_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_workspace_id ON sessions (workspace_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at   ON sessions (expires_at);

-- ── Session Transfers ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_transfers (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    token_hash   TEXT        NOT NULL UNIQUE, -- SHA-256 hex of single-use token
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at   TIMESTAMPTZ NOT NULL,
    used_at      TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_transfers_token_hash   ON session_transfers (token_hash) WHERE used_at IS NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transfers_workspace_id ON session_transfers (workspace_id);

-- ── Associate links with workspace ─────────────────────────────────────────
ALTER TABLE links ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_links_workspace_id ON links (workspace_id, created_at DESC) WHERE deleted_at IS NULL;
