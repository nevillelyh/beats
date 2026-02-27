import { beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  addSession,
  createArtist,
  createLick,
  getProgressDistribution,
  getArtists,
  getStatsBars,
  getStats,
  getLicks,
  getSessionRpmRange,
  hasSessionForDate,
  openDb,
  updateArtist,
  updateLick,
} from "../src/db";

let db: Database;

beforeEach(() => {
  db = openDb(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE artists (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );
    CREATE TABLE licks (
      id INTEGER PRIMARY KEY,
      artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      url TEXT,
      goal_rpm INTEGER NOT NULL CHECK(goal_rpm > 0),
      UNIQUE(artist_id, name)
    );
    CREATE TABLE sessions (
      id INTEGER PRIMARY KEY,
      lick_id INTEGER NOT NULL REFERENCES licks(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      rpm INTEGER NOT NULL CHECK(rpm > 0),
      UNIQUE(lick_id, date)
    );
  `);
});

describe("db behavior", () => {
  test("update artist updates artist name", () => {
    const artistId = createArtist(db, "Pat");
    updateArtist(db, artistId, "Pat Metheny");
    expect(getArtists(db)).toEqual([{ id: artistId, name: "Pat Metheny" }]);
  });

  test("update artist preserves unique name constraint", () => {
    const a = createArtist(db, "Pat");
    createArtist(db, "Kurt");
    expect(() => updateArtist(db, a, "Kurt")).toThrow();
  });

  test("update lick edits name, url, and goal", () => {
    const lickId = createLick(db, "Pat", "Line A", 120, "https://old.example");
    updateLick(db, lickId, "Line A v2", 150, "https://new.example");

    const rows = getLicks(db, null, "artist", "asc", "2026-02-11");
    expect(rows[0].lick_name).toBe("Line A v2");
    expect(rows[0].lick_url).toBe("https://new.example");
    expect(rows[0].goal_rpm).toBe(150);
  });

  test("update lick enforces unique artist+lick name", () => {
    const a = createLick(db, "Pat", "Line A", 120);
    createLick(db, "Pat", "Line B", 120);
    expect(() => updateLick(db, a, "Line B", 120)).toThrow();
  });

  test("update lick requires goal to be at least previous best", () => {
    const lickId = createLick(db, "Pat", "Line A", 200);
    addSession(db, lickId, "2026-02-10", 140);
    expect(() => updateLick(db, lickId, "Line A", 139)).toThrow("goalRpm must be at least 140");
  });

  test("lick aggregates and can_add_today", () => {
    const lickId = createLick(db, "Pat", "Outside phrase", 200);
    addSession(db, lickId, "2026-02-09", 120);
    addSession(db, lickId, "2026-02-10", 150);

    const rows = getLicks(db, null, "artist", "asc", "2026-02-11");
    expect(rows.length).toBe(1);
    expect(rows[0].best_rpm).toBe(150);
    expect(rows[0].pct_of_goal).toBe(75);
    expect(rows[0].first_date).toBe("2026-02-09");
    expect(rows[0].last_date).toBe("2026-02-10");
    expect(rows[0].can_add_today).toBe(true);
  });

  test("cannot add today when session exists", () => {
    const lickId = createLick(db, "Pat", "Alt phrase", 160);
    addSession(db, lickId, "2026-02-11", 140);

    const rows = getLicks(db, null, "artist", "asc", "2026-02-11");
    expect(rows[0].can_add_today).toBe(false);
    expect(hasSessionForDate(db, lickId, "2026-02-11")).toBe(true);
  });

  test("cannot add when best meets goal", () => {
    const lickId = createLick(db, "Pat", "Target hit", 150);
    addSession(db, lickId, "2026-02-09", 150);

    const rows = getLicks(db, null, "artist", "asc", "2026-02-11");
    expect(rows[0].can_add_today).toBe(false);
  });

  test("session rpm range uses previous best plus one as minimum", () => {
    expect(getSessionRpmRange(1, 200)).toEqual({ min: 2, max: 200 });
    expect(getSessionRpmRange(150, 200)).toEqual({ min: 151, max: 200 });
    expect(getSessionRpmRange(152, 200)).toEqual({ min: 153, max: 200 });
  });

  test("session rpm range handles missing best rpm", () => {
    expect(getSessionRpmRange(null, 180)).toEqual({ min: 1, max: 180 });
  });

  test("stats aggregates session counts by date", () => {
    const lickA = createLick(db, "Pat", "Line A", 180);
    const lickB = createLick(db, "Pat", "Line B", 180);
    addSession(db, lickA, "2026-02-10", 120);
    addSession(db, lickB, "2026-02-10", 130);
    addSession(db, lickA, "2026-02-11", 135);

    expect(getStats(db)).toEqual([
      { date: "2026-02-10", session_count: 2 },
      { date: "2026-02-11", session_count: 1 },
    ]);
  });

  test("stats bars classify sessions and compute progress deltas by day", () => {
    const lickA = createLick(db, "Pat", "Line A", 100);
    const lickB = createLick(db, "Pat", "Line B", 200);
    const lickC = createLick(db, "Pat", "Line C", 100);

    addSession(db, lickA, "2026-02-10", 40);   // first, +10
    addSession(db, lickA, "2026-02-11", 70);   // progression, +30
    addSession(db, lickA, "2026-02-12", 105);  // completion, +35
    addSession(db, lickA, "2026-02-13", 100);  // progression, -5

    addSession(db, lickB, "2026-02-11", 120);  // first, +10
    addSession(db, lickB, "2026-02-12", 150);  // progression, +15
    addSession(db, lickC, "2026-02-12", 110);  // first+completion, +10

    expect(getStatsBars(db)).toEqual({
      sessions: [
        { date: "2026-02-10", first_sessions: 1, completion_sessions: 0, progression_sessions: 0, first_completion_sessions: 0 },
        { date: "2026-02-11", first_sessions: 1, completion_sessions: 0, progression_sessions: 1, first_completion_sessions: 0 },
        { date: "2026-02-12", first_sessions: 0, completion_sessions: 1, progression_sessions: 1, first_completion_sessions: 1 },
        { date: "2026-02-13", first_sessions: 0, completion_sessions: 0, progression_sessions: 1, first_completion_sessions: 0 },
      ],
      progress: [
        { date: "2026-02-10", progress_values: [10] },
        { date: "2026-02-11", progress_values: [30, 10] },
        { date: "2026-02-12", progress_values: [35, 15, 10] },
        { date: "2026-02-13", progress_values: [-5] },
      ],
      rpms: [
        { date: "2026-02-10", first_sessions: 1, delta_bins: [] },
        { date: "2026-02-11", first_sessions: 1, delta_bins: [{ delta_bin: 30, session_count: 1 }] },
        { date: "2026-02-12", first_sessions: 1, delta_bins: [{ delta_bin: 30, session_count: 1 }, { delta_bin: 35, session_count: 1 }] },
        { date: "2026-02-13", first_sessions: 0, delta_bins: [{ delta_bin: 5, session_count: 1 }] },
      ],
    });
  });

  test("best % distribution returns 0..100 bins in steps of 10", () => {
    const a = createLick(db, "Pat", "A", 100); // no sessions -> 0
    const b = createLick(db, "Pat", "B", 100); // 23 -> 20
    const c = createLick(db, "Pat", "C", 100); // 68 -> 60
    const d = createLick(db, "Pat", "D", 100); // 100 -> 100

    addSession(db, b, "2026-02-10", 23);
    addSession(db, c, "2026-02-10", 68);
    addSession(db, d, "2026-02-10", 100);

    const expected = [];
    for (let bucket = 0; bucket <= 100; bucket += 10) {
      const lick_count = bucket === 0 || bucket === 20 || bucket === 60 || bucket === 100 ? 1 : 0;
      expected.push({ bucket_pct: bucket, lick_count });
    }
    expect(getProgressDistribution(db)).toEqual(expected);
    expect(a).toBeGreaterThan(0);
  });
});
