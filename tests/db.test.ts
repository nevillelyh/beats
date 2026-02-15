import { beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
  addSession,
  createLick,
  getStats,
  getLicks,
  getSessionRpmRange,
  hasSessionForDate,
  openDb,
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
});
