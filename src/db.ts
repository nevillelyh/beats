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
  lick_url: string | null;
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

export type StatsDay = {
  date: string;
  session_count: number;
};

export type StatsSessionBarsDay = {
  date: string;
  first_sessions: number;
  completion_sessions: number;
  progression_sessions: number;
  first_completion_sessions: number;
};

export type StatsProgressBarsDay = {
  date: string;
  progress_values: number[];
};

export type StatsRpmBarsDay = {
  date: string;
  first_sessions: number;
  delta_bins: Array<{
    delta_bin: number;
    session_count: number;
  }>;
};

export type StatsBars = {
  sessions: StatsSessionBarsDay[];
  progress: StatsProgressBarsDay[];
  rpms: StatsRpmBarsDay[];
};

export type StatsHistogramBin = {
  bucket: number;
  count: number;
};

export type StatsHistograms = {
  session_deltas: StatsHistogramBin[];
  sessions_to_complete: StatsHistogramBin[];
  days_to_complete: StatsHistogramBin[];
};

export type StatsProgressBin = {
  bucket_pct: number;
  lick_count: number;
};

export type SessionRpmRange = {
  min: number;
  max: number;
};

export type CreateLickInput = {
  lickName: string;
  goalRpm: number;
  lickUrl?: string;
};

const SORT_MAP: Record<string, string> = {
  artist: "artist_name",
  lick: "lick_name",
  goal: "goal_rpm",
  best: "best_rpm",
  pct: "pct_of_goal",
  sessions: "session_count",
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
  const schemaPath = new URL("./schema.sql", import.meta.url);
  const sql = readFileSync(schemaPath, "utf8");
  db.exec(sql);
  // Lightweight migration for existing DBs created before lick URL support.
  try {
    db.exec("ALTER TABLE licks ADD COLUMN url TEXT");
  } catch (_err) {
    // Ignore duplicate-column errors.
  }
}

export function getArtists(db: Database): Artist[] {
  return db
    .query("SELECT id, name FROM artists ORDER BY name ASC")
    .all() as Artist[];
}

export function createArtist(db: Database, artistName: string): number {
  const cleanArtist = artistName.trim();
  if (!cleanArtist) {
    throw new Error("artistName is required");
  }

  db.query("INSERT INTO artists(name) VALUES (?)").run(cleanArtist);
  const row = db
    .query("SELECT id FROM artists WHERE name = ?")
    .get(cleanArtist) as { id: number } | null;
  if (!row) {
    throw new Error("Failed to create artist");
  }
  return row.id;
}

export function updateArtist(db: Database, artistId: number, artistName: string): void {
  if (!Number.isInteger(artistId) || artistId <= 0) {
    throw new Error("artistId must be a positive integer");
  }
  const cleanArtist = artistName.trim();
  if (!cleanArtist) {
    throw new Error("artistName is required");
  }

  const existing = db
    .query("SELECT id FROM artists WHERE id = ?")
    .get(artistId) as { id: number } | null;
  if (!existing) {
    throw new Error("Artist not found");
  }

  db.query("UPDATE artists SET name = ? WHERE id = ?").run(cleanArtist, artistId);
}

export function createLick(
  db: Database,
  artistName: string,
  lickName: string,
  goalRpm: number,
  lickUrl?: string,
): number {
  return createLicks(db, artistName, [{ lickName, goalRpm, lickUrl }])[0];
}

export function createLicks(
  db: Database,
  artistName: string,
  licks: CreateLickInput[],
): number[] {
  const cleanArtist = artistName.trim();
  if (!cleanArtist) {
    throw new Error("artistName is required");
  }
  if (!Array.isArray(licks) || licks.length === 0) {
    throw new Error("At least one lick is required");
  }

  const prepared = licks.map(({ lickName, goalRpm, lickUrl }) => {
    const cleanLick = lickName.trim();
    if (!cleanLick) {
      throw new Error("lickName is required");
    }
    if (!Number.isInteger(goalRpm) || goalRpm <= 0) {
      throw new Error("goalRpm must be a positive integer");
    }
    return {
      lickName: cleanLick,
      goalRpm,
      lickUrl: lickUrl?.trim() ? lickUrl.trim() : null,
    };
  });

  const createdIds: number[] = [];

  db.transaction(() => {
    db.query("INSERT OR IGNORE INTO artists(name) VALUES (?)").run(cleanArtist);
    const row = db
      .query("SELECT id FROM artists WHERE name = ?")
      .get(cleanArtist) as { id: number } | null;
    if (!row) {
      throw new Error("Failed to resolve artist");
    }

    const insertLick = db.query("INSERT INTO licks(artist_id, name, url, goal_rpm) VALUES (?, ?, ?, ?)");
    const findCreated = db.query(
      `SELECT id
       FROM licks
       WHERE artist_id = ? AND name = ?`,
    );

    for (const lick of prepared) {
      insertLick.run(row.id, lick.lickName, lick.lickUrl, lick.goalRpm);
      const created = findCreated.get(row.id, lick.lickName) as { id: number } | null;
      if (!created) {
        throw new Error("Failed to create lick");
      }
      createdIds.push(created.id);
    }
  })();

  return createdIds;
}

export function updateLick(
  db: Database,
  lickId: number,
  lickName: string,
  goalRpm: number,
  lickUrl?: string,
): void {
  if (!Number.isInteger(lickId) || lickId <= 0) {
    throw new Error("lickId must be a positive integer");
  }
  const cleanLick = lickName.trim();
  if (!cleanLick) {
    throw new Error("lickName is required");
  }
  if (!Number.isInteger(goalRpm) || goalRpm <= 0) {
    throw new Error("goalRpm must be a positive integer");
  }

  const meta = db
    .query(
      `SELECT
         l.id,
         MAX(s.rpm) AS best_rpm
       FROM licks l
       LEFT JOIN sessions s ON s.lick_id = l.id
       WHERE l.id = ?
       GROUP BY l.id`,
    )
    .get(lickId) as { id: number; best_rpm: number | null } | null;
  if (!meta) {
    throw new Error("Lick not found");
  }

  const minGoal = meta.best_rpm === null ? 1 : meta.best_rpm;
  if (goalRpm < minGoal) {
    throw new Error(`goalRpm must be at least ${minGoal}`);
  }

  const cleanUrl = lickUrl?.trim() ? lickUrl.trim() : null;
  db.query("UPDATE licks SET name = ?, url = ?, goal_rpm = ? WHERE id = ?").run(
    cleanLick,
    cleanUrl,
    goalRpm,
    lickId,
  );
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
      l.url AS lick_url,
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
    GROUP BY l.id, a.id, a.name, l.name, l.url, l.goal_rpm
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

export function getSessionRpmRange(
  bestRpm: number | null,
  goalRpm: number,
): SessionRpmRange {
  if (!Number.isInteger(goalRpm) || goalRpm <= 0) {
    throw new Error("goalRpm must be a positive integer");
  }
  const min = bestRpm === null ? 1 : bestRpm + 1;
  return { min, max: goalRpm };
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

export function getStats(db: Database): StatsDay[] {
  return db
    .query(
      `SELECT
         date,
         COUNT(*) AS session_count
       FROM sessions
       GROUP BY date
       ORDER BY date ASC`,
    )
    .all() as StatsDay[];
}

type SessionRow = {
  id: number;
  lick_id: number;
  date: string;
  rpm: number;
  goal_rpm: number;
};

function querySessionRows(db: Database): SessionRow[] {
  return db
    .query(
      `SELECT
         s.id,
         s.lick_id,
         s.date,
         s.rpm,
         l.goal_rpm
       FROM sessions s
       JOIN licks l ON l.id = s.lick_id
       ORDER BY s.lick_id ASC, s.date ASC, s.id ASC`,
    )
    .all() as SessionRow[];
}

export function getStatsBars(db: Database): StatsBars {
  const rows = querySessionRows(db);

  const sessionsByDate = new Map<string, StatsSessionBarsDay>();
  const progressByDate = new Map<string, number[]>();
  const rpmsByDate = new Map<string, { first_sessions: number; delta_bins: Map<number, number> }>();
  const lickState = new Map<number, {
    seen: boolean;
    prev_pct: number | null;
    prev_rpm: number | null;
    reached_goal: boolean;
  }>();

  for (const row of rows) {
    const pct = (row.rpm * 100) / row.goal_rpm;
    let day = sessionsByDate.get(row.date);
    if (!day) {
      day = {
        date: row.date,
        first_sessions: 0,
        completion_sessions: 0,
        progression_sessions: 0,
        first_completion_sessions: 0,
      };
      sessionsByDate.set(row.date, day);
    }

    const state = lickState.get(row.lick_id) ?? {
      seen: false,
      prev_pct: null,
      prev_rpm: null,
      reached_goal: false,
    };
    let rpmDay = rpmsByDate.get(row.date);
    if (!rpmDay) {
      rpmDay = { first_sessions: 0, delta_bins: new Map<number, number>() };
      rpmsByDate.set(row.date, rpmDay);
    }

    if (!state.seen && pct >= 100) {
      day.first_completion_sessions += 1;
      rpmDay.first_sessions += 1;
    } else if (!state.seen) {
      day.first_sessions += 1;
      rpmDay.first_sessions += 1;
    } else if (!state.reached_goal && pct >= 100) {
      day.completion_sessions += 1;
    } else {
      day.progression_sessions += 1;
    }

    const delta = state.prev_pct === null ? 10 : pct - state.prev_pct;
    if (state.prev_rpm !== null) {
      const rpmDelta = Math.abs(row.rpm - state.prev_rpm);
      const deltaBin = Math.max(5, Math.ceil(Math.max(rpmDelta, 0.1) / 5) * 5);
      rpmDay.delta_bins.set(deltaBin, (rpmDay.delta_bins.get(deltaBin) ?? 0) + 1);
    }
    const roundedDelta = Math.round(delta * 10) / 10;
    const progressParts = progressByDate.get(row.date) ?? [];
    progressParts.push(roundedDelta);
    progressByDate.set(row.date, progressParts);

    state.seen = true;
    state.prev_pct = pct;
    state.prev_rpm = row.rpm;
    if (pct >= 100) {
      state.reached_goal = true;
    }
    lickState.set(row.lick_id, state);
  }

  const dates = [...sessionsByDate.keys()].sort();
  return {
    sessions: dates.map((date) => sessionsByDate.get(date)!),
    progress: dates.map((date) => ({
      date,
      progress_values: progressByDate.get(date) ?? [],
    })),
    rpms: dates.map((date) => {
      const row = rpmsByDate.get(date) ?? { first_sessions: 0, delta_bins: new Map<number, number>() };
      const delta_bins = [...row.delta_bins.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([delta_bin, session_count]) => ({ delta_bin, session_count }));
      return {
        date,
        first_sessions: row.first_sessions,
        delta_bins,
      };
    }),
  };
}

export function getProgressDistribution(db: Database): StatsProgressBin[] {
  const rows = db
    .query(
      `SELECT
         l.id,
         l.goal_rpm,
         MAX(s.rpm) AS best_rpm
       FROM licks l
       LEFT JOIN sessions s ON s.lick_id = l.id
       GROUP BY l.id, l.goal_rpm`,
    )
    .all() as Array<{ id: number; goal_rpm: number; best_rpm: number | null }>;

  const counts = new Map<number, number>();
  for (let bucket = 0; bucket <= 100; bucket += 10) {
    counts.set(bucket, 0);
  }

  for (const row of rows) {
    const pct = row.best_rpm === null ? 0 : (row.best_rpm * 100) / row.goal_rpm;
    const bucket = pct >= 100 ? 100 : Math.floor(Math.max(0, pct) / 10) * 10;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }

  const output: StatsProgressBin[] = [];
  for (let bucket = 0; bucket <= 100; bucket += 10) {
    output.push({
      bucket_pct: bucket,
      lick_count: counts.get(bucket) ?? 0,
    });
  }
  return output;
}

function incrementBucket(map: Map<number, number>, bucket: number): void {
  map.set(bucket, (map.get(bucket) ?? 0) + 1);
}

function toSortedBins(map: Map<number, number>): StatsHistogramBin[] {
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bucket, count]) => ({ bucket, count }));
}

function diffDaysUtc(start: string, end: string): number {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return 0;
  }
  return Math.floor((endMs - startMs) / 86400000);
}

export function getStatsHistograms(db: Database): StatsHistograms {
  const rows = querySessionRows(db);

  const deltaCounts = new Map<number, number>();
  const sessionsToCompleteCounts = new Map<number, number>();
  const daysToCompleteCounts = new Map<number, number>();
  const lickState = new Map<number, {
    goal_rpm: number;
    prev_rpm: number | null;
    first_date: string | null;
    session_count: number;
    completed: boolean;
  }>();

  for (const row of rows) {
    const state = lickState.get(row.lick_id) ?? {
      goal_rpm: row.goal_rpm,
      prev_rpm: null,
      first_date: null,
      session_count: 0,
      completed: false,
    };
    state.session_count += 1;
    if (state.first_date === null) {
      state.first_date = row.date;
    }

    if (state.prev_rpm !== null) {
      const delta = Math.abs(row.rpm - state.prev_rpm);
      const bucket = Math.max(5, Math.ceil(Math.max(delta, 1) / 5) * 5);
      incrementBucket(deltaCounts, bucket);
    }

    if (!state.completed && row.rpm >= state.goal_rpm) {
      state.completed = true;
      incrementBucket(sessionsToCompleteCounts, state.session_count);
      const days = Math.max(1, diffDaysUtc(state.first_date!, row.date) + 1);
      incrementBucket(daysToCompleteCounts, days);
    }

    state.prev_rpm = row.rpm;
    lickState.set(row.lick_id, state);
  }

  return {
    session_deltas: toSortedBins(deltaCounts),
    sessions_to_complete: toSortedBins(sessionsToCompleteCounts),
    days_to_complete: toSortedBins(daysToCompleteCounts),
  };
}

export function formatLocalDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function normalizeLocalDate(value: string | null | undefined): string {
  if (!value) {
    return formatLocalDate();
  }
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("X-Local-Date must be YYYY-MM-DD");
  }
  return trimmed;
}
