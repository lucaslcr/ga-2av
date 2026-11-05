CREATE TABLE IF NOT EXISTS users (
  username     TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  pin_hash     TEXT NOT NULL,
  salt         TEXT NOT NULL,
  data         TEXT,
  ts           INTEGER NOT NULL DEFAULT 0,
  fails        INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  created      INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  username   TEXT NOT NULL,
  created    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(username);
