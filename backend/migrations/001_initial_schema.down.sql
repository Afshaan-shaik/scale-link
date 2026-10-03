-- Migration: 001_initial_schema.down.sql
-- Rolls back the initial schema. Used for testing only.

DROP TRIGGER IF EXISTS trg_links_updated_at ON links;
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
DROP FUNCTION IF EXISTS set_updated_at();
DROP TABLE IF EXISTS click_events;
DROP TABLE IF EXISTS blocked_domains;
DROP TABLE IF EXISTS links;
DROP TABLE IF EXISTS api_keys;
DROP TABLE IF EXISTS users;
DROP EXTENSION IF EXISTS "pg_trgm";
DROP EXTENSION IF EXISTS "uuid-ossp";
