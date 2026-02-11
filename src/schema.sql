PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS artists (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS licks (
  id INTEGER PRIMARY KEY,
  artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  goal_rpm INTEGER NOT NULL CHECK(goal_rpm > 0),
  UNIQUE(artist_id, name)
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY,
  lick_id INTEGER NOT NULL REFERENCES licks(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  rpm INTEGER NOT NULL CHECK(rpm > 0),
  UNIQUE(lick_id, date)
);

CREATE INDEX IF NOT EXISTS idx_licks_artist_id ON licks(artist_id);
CREATE INDEX IF NOT EXISTS idx_sessions_lick_id ON sessions(lick_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);
