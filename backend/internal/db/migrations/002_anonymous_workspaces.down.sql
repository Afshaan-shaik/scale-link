-- Migration: 002_anonymous_workspaces.down.sql

DROP INDEX IF EXISTS idx_links_workspace_id;
ALTER TABLE links DROP COLUMN IF EXISTS workspace_id;
DROP TABLE IF EXISTS session_transfers;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS workspaces;
