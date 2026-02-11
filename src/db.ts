import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";

export type Artist = {
  id: number;
  name: string;
};

export type LickAggregate = {
  id: number;
  artist_id: number;
  artist_name: string;
  lick_name: string;
  goal_rpm: number;
  best_rpm: number | null;
  pct_of_goal: number | null;
  first_date: string | null;
  last_date: string | null;
  session_count: number;
  can_add_today: boolean;
};

export type Session = {
  id: number;
  lick_id: number;
  date: string;
  rpm: number;
};

const SORT_MAP: Record<string, string> = {
  artist: "artist_name",
  lick: "lick_name",
  goal: "goal_rpm",
  best: "best_rpm",
  pct: "pct_of_goal",
  first: "first_date",
  last: "last_date",
};

const SESSION_SORT_MAP: Record<string, string> = {
  date: "date",
  rpm: "rpm",
};

export function openDb(path: string): Database {
  const db = new Database(path, { create: true, strict: true });
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

export function initSchema(db: Database): void {
  const sql = readFileSync("src/schema.sql", "utf8");
  db.exec(sql);
}

export function getArtists(db: Database): Artist[] {
  return db
    .query("SELECT id, name FROM artists ORDER BY name ASC")
    .all() as Artist[];
}

export function createLick(
  db: Database,
  artistName: string,
  lickName: string,
  goalRpm: number,
): number {
  const cleanArtist = artistName.trim();
  const cleanLick = lickName.trim();
  if (!cleanArtist || !cleanLick) {
    throw new Error("artistName and lickName are required");
  }
  if (!Number.isInteger(goalRpm) || goalRpm <= 0) {
    throw new Error("goalRpm must be a positive integer");
  }

  db.transaction(() => {
    db.query("INSERT OR IGNORE INTO artists(name) VALUES (?)").run(cleanArtist);
    const row = db
      .query("SELECT id FROM artists WHERE name = ?")
      .get(cleanArtist) as { id: number } | null;
    if (!row) {
      throw new Error("Failed to resolve artist");
    }

    db.query("INSERT INTO licks(artist_id, name, goal_rpm) VALUES (?, ?, ?)").run(
      row.id,
      cleanLick,
      goalRpm,
    );
  })();

  const created = db
    .query(
      `SELECT l.id
       FROM licks l
       JOIN artists a ON a.id = l.artist_id
       WHERE a.name = ? AND l.name = ?`,
    )
    .get(cleanArtist, cleanLick) as { id: number } | null;

  if (!created) {
    throw new Error("Failed to create lick");
  }
  return created.id;
}

export function getLicks(
  db: Database,
  artistId: number | null,
  sortBy: string,
  sortDir: string,
  localDate: string,
): LickAggregate[] {
  const sortColumn = SORT_MAP[sortBy] ?? "artist_name";
  const sortDirection = sortDir?.toLowerCase() === "desc" ? "DESC" : "ASC";

  const base = `
    SELECT
      l.id,
      a.id AS artist_id,
      a.name AS artist_name,
      l.name AS lick_name,
      l.goal_rpm,
      MAX(s.rpm) AS best_rpm,
      CASE
        WHEN MAX(s.rpm) IS NULL THEN NULL
        ELSE CAST(ROUND((MAX(s.rpm) * 100.0) / l.goal_rpm) AS INTEGER)
      END AS pct_of_goal,
      MIN(s.date) AS first_date,
      MAX(s.date) AS last_date,
      COUNT(s.id) AS session_count,
      CASE
        WHEN MAX(s.rpm) >= l.goal_rpm THEN 0
        WHEN EXISTS (
          SELECT 1 FROM sessions sx WHERE sx.lick_id = l.id AND sx.date = ?
        ) THEN 0
        ELSE 1
      END AS can_add_today
    FROM licks l
    JOIN artists a ON a.id = l.artist_id
    LEFT JOIN sessions s ON s.lick_id = l.id
    %ARTIST_FILTER%
    GROUP BY l.id, a.id, a.name, l.name, l.goal_rpm
    ORDER BY ${sortColumn} ${sortDirection}, l.id ASC
  `;

  if (artistId === null) {
    const sql = base.replace("%ARTIST_FILTER%", "");
    return db
      .query(sql)
      .all(localDate)
      .map((r) => ({ ...r, can_add_today: Boolean((r as any).can_add_today) })) as LickAggregate[];
  }

  const sql = base.replace("%ARTIST_FILTER%", "WHERE a.id = ?");
  return db
    .query(sql)
    .all(localDate, artistId)
    .map((r) => ({ ...r, can_add_today: Boolean((r as any).can_add_today) })) as LickAggregate[];
}

export function getLickMeta(
  db: Database,
  lickId: number,
): { goal_rpm: number; best_rpm: number | null } | null {
  return db
    .query(
      `SELECT
         l.goal_rpm,
         MAX(s.rpm) AS best_rpm
       FROM licks l
       LEFT JOIN sessions s ON s.lick_id = l.id
       WHERE l.id = ?
       GROUP BY l.id, l.goal_rpm`,
    )
    .get(lickId) as { goal_rpm: number; best_rpm: number | null } | null;
}

export function hasSessionForDate(
  db: Database,
  lickId: number,
  date: string,
): boolean {
  const row = db
    .query("SELECT 1 AS found FROM sessions WHERE lick_id = ? AND date = ?")
    .get(lickId, date) as { found: number } | null;
  return Boolean(row?.found);
}

export function addSession(
  db: Database,
  lickId: number,
  date: string,
  rpm: number,
): number {
  if (!Number.isInteger(rpm) || rpm <= 0) {
    throw new Error("rpm must be a positive integer");
  }
  db.query("INSERT INTO sessions(lick_id, date, rpm) VALUES (?, ?, ?)").run(
    lickId,
    date,
    rpm,
  );
  const row = db
    .query("SELECT id FROM sessions WHERE lick_id = ? AND date = ?")
    .get(lickId, date) as { id: number } | null;
  if (!row) {
    throw new Error("Failed to create session");
  }
  return row.id;
}

export function getSessions(
  db: Database,
  lickId: number,
  sortBy: string,
  sortDir: string,
): Session[] {
  const sortColumn = SESSION_SORT_MAP[sortBy] ?? "date";
  const sortDirection = sortDir?.toLowerCase() === "desc" ? "DESC" : "ASC";
  return db
    .query(
      `SELECT id, lick_id, date, rpm
       FROM sessions
       WHERE lick_id = ?
       ORDER BY ${sortColumn} ${sortDirection}, id ASC`,
    )
    .all(lickId) as Session[];
}

export function normalizeLocalDate(value: string | null | undefined): string {
  if (!value) {
    return new Date().toLocaleDateString("en-CA");
  }
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("X-Local-Date must be YYYY-MM-DD");
  }
  return trimmed;
}
