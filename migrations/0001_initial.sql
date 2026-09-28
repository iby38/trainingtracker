-- DRAFT schema for the future backend. Nothing uses this yet.
-- Apply later with:  npx wrangler d1 migrations apply trainingtracker --remote
--
-- Design: one generic table of records. It mirrors the app's data model exactly
-- (exercises, sets, sessions, routines, categories), so sync is simply
-- "send me every record for this user changed since time X".

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS records (
  user_id     TEXT    NOT NULL REFERENCES users(id),
  kind        TEXT    NOT NULL,            -- 'exercises' | 'sets' | 'sessions' | 'routines' | 'categories'
  id          TEXT    NOT NULL,            -- the record's id from the app
  data        TEXT    NOT NULL,            -- the record as JSON
  updated_at  INTEGER NOT NULL,            -- newest edit wins
  deleted     INTEGER NOT NULL DEFAULT 0,  -- 1 = tombstone
  PRIMARY KEY (user_id, kind, id)
);

CREATE INDEX IF NOT EXISTS idx_records_user_updated ON records (user_id, updated_at);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id     TEXT PRIMARY KEY REFERENCES users(id),
  data        TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);
