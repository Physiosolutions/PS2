-- Physio Cloud — D1 schema (SQLite)
-- Apply with: wrangler d1 execute physio-db --remote --file=./schema.sql

PRAGMA foreign_keys = ON;

-- Generic record mirror: every localStorage store is saved here as a JSON string.
-- This keeps the existing app 100% compatible while moving storage to the cloud.
CREATE TABLE IF NOT EXISTS kv_store (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_kv_updated ON kv_store (updated_at);

-- Values larger than one D1 row (1 MB) are split into chunks here.
-- The kv_store row then holds a pointer: "\u0001v<version>:<chunkCount>".
CREATE TABLE IF NOT EXISTS kv_chunks (
  store_key TEXT NOT NULL,
  version   INTEGER NOT NULL,
  idx       INTEGER NOT NULL,
  data      TEXT NOT NULL,
  PRIMARY KEY (store_key, version, idx)
);
CREATE INDEX IF NOT EXISTS idx_kv_chunks_version ON kv_chunks (store_key, version);

-- Server-side accounts (passwords are PBKDF2-SHA256; never stored in plain text).
CREATE TABLE IF NOT EXISTS users (
  email         TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'Physiotherapist',
  active        INTEGER NOT NULL DEFAULT 1,
  data          TEXT NOT NULL DEFAULT '{}',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- Login sessions (only a SHA-256 hash of the bearer token is stored).
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions (email);

-- Photo/file metadata (the bytes live in R2, not in the database).
CREATE TABLE IF NOT EXISTS photos (
  key          TEXT PRIMARY KEY,
  content_type TEXT,
  size         INTEGER,
  uploaded_at  INTEGER,
  uploaded_by  TEXT
);

-- Audit trail for writes (useful once you go "official").
CREATE TABLE IF NOT EXISTS audit_log (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  at     INTEGER NOT NULL,
  actor  TEXT,
  action TEXT NOT NULL,
  detail TEXT
);
