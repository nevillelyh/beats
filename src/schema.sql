CREATE TABLE IF NOT EXISTS artists (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS licks (
  id INTEGER PRIMARY KEY,
  artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT,
  kind TEXT NOT NULL DEFAULT 'lick' CHECK(kind IN ('lick', 'lesson')),
  goal_bpm INTEGER,
  starred BOOLEAN NOT NULL DEFAULT FALSE,
  CHECK((kind = 'lick' AND goal_bpm IS NOT NULL AND goal_bpm > 0) OR (kind = 'lesson' AND goal_bpm IS NULL)),
  UNIQUE(id, kind),
  UNIQUE(artist_id, name)
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY,
  lick_id INTEGER NOT NULL REFERENCES licks(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'lick',
  bpm INTEGER,
  CHECK((kind = 'lick' AND bpm IS NOT NULL AND bpm > 0) OR (kind = 'lesson' AND bpm IS NULL)),
  FOREIGN KEY(lick_id, kind) REFERENCES licks(id, kind) ON DELETE CASCADE,
  UNIQUE(lick_id, date)
);

CREATE INDEX IF NOT EXISTS idx_licks_artist_id ON licks(artist_id);
CREATE INDEX IF NOT EXISTS idx_sessions_lick_id ON sessions(lick_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);
