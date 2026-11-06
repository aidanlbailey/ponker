-- Accounts. No email or anything else from the provider, just who they are there
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  name TEXT NOT NULL,
  name_lc TEXT NOT NULL UNIQUE,
  avatar TEXT,
  created INTEGER NOT NULL,
  UNIQUE (provider, provider_id)
);

-- the token's hash, the token itself only ever lives in the browser
CREATE TABLE sessions (
  hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

-- one per reporter per player, waiting for a look on #admin. Cleared when the art changes or gets looked at
CREATE TABLE reports (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reporter_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, reporter_id)
);
