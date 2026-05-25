import { beforeEach, describe, expect, test, afterAll } from "bun:test";
import postgres from "postgres";
import {
  addSession,
  createArtist,
  createLick,
  createLicks,
  getProgressDistribution,
  getArtists,
  getSessions,
  getStatsHistograms,
  getStatsBars,
  getStats,
  getLicks,
  getSessionBpmRange,
  hasSessionForDate,
  initSchema,
  openDb,
  updateArtist,
  updateLick,
} from "../src/db";

let db: postgres.Sql;

beforeEach(async () => {
  const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || "postgres://beats:beats@localhost:5432/beats";
  db = openDb(url);
  // Clean DB before each test so we have a completely clean slate
  await db`DROP TABLE IF EXISTS sessions CASCADE`;
  await db`DROP TABLE IF EXISTS licks CASCADE`;
  await db`DROP TABLE IF EXISTS artists CASCADE`;
  await initSchema(db);
});

afterAll(async () => {
  if (db) {
    await db.end();
  }
});

describe("db behavior", () => {
  test("update artist updates artist name", async () => {
    const artistId = await createArtist(db, "Pat");
    await updateArtist(db, artistId, "Pat Metheny");
    expect(await getArtists(db)).toEqual([{ id: artistId, name: "Pat Metheny" }]);
  });

  test("update artist preserves unique name constraint", async () => {
    const a = await createArtist(db, "Pat");
    await createArtist(db, "Kurt");
    expect(updateArtist(db, a, "Kurt")).rejects.toThrow();
  });

  test("update lick edits name, url, and goal", async () => {
    const lickId = await createLick(db, "Pat", "Line A", 120, "https://old.example");
    await updateLick(db, lickId, "Line A v2", 150, "https://new.example");

    const rows = await getLicks(db, null, "artist", "asc", "2026-02-11");
    expect(rows[0].lick_name).toBe("Line A v2");
    expect(rows[0].lick_url).toBe("https://new.example");
    expect(rows[0].goal_bpm).toBe(150);
  });

  test("create licks adds multiple licks in one transaction", async () => {
    const ids = await createLicks(db, "Pat", [
      { lickName: "Line A", goalBpm: 120 },
      { lickName: "Line B", goalBpm: 135 },
    ]);

    const rows = await getLicks(db, null, "lick", "asc", "2026-02-11");
    expect(ids).toHaveLength(2);
    expect(rows.map((row) => ({ name: row.lick_name, goal: row.goal_bpm }))).toEqual([
      { name: "Line A", goal: 120 },
      { name: "Line B", goal: 135 },
    ]);
  });

  test("update lick enforces unique artist+lick name", async () => {
    const a = await createLick(db, "Pat", "Line A", 120);
    await createLick(db, "Pat", "Line B", 120);
    expect(updateLick(db, a, "Line B", 120)).rejects.toThrow();
  });

  test("update lick requires goal to be at least previous best", async () => {
    const lickId = await createLick(db, "Pat", "Line A", 200);
    await addSession(db, lickId, "2026-02-10", 140);
    expect(updateLick(db, lickId, "Line A", 139)).rejects.toThrow("goalBpm must be at least 140");
  });

  test("lick aggregates and can_add_today", async () => {
    const lickId = await createLick(db, "Pat", "Outside phrase", 200);
    await addSession(db, lickId, "2026-02-09", 120);
    await addSession(db, lickId, "2026-02-10", 150);

    const rows = await getLicks(db, null, "artist", "asc", "2026-02-11");
    expect(rows.length).toBe(1);
    expect(rows[0].best_bpm).toBe(150);
    expect(rows[0].pct_of_goal).toBe(75);
    expect(rows[0].first_date).toBe("2026-02-09");
    expect(rows[0].last_date).toBe("2026-02-10");
    expect(rows[0].can_add_today).toBe(true);
  });

  test("can still add today when a session exists and goal is not met", async () => {
    const lickId = await createLick(db, "Pat", "Alt phrase", 160);
    await addSession(db, lickId, "2026-02-11", 140);

    const rows = await getLicks(db, null, "artist", "asc", "2026-02-11");
    expect(rows[0].can_add_today).toBe(true);
    expect(await hasSessionForDate(db, lickId, "2026-02-11")).toBe(true);
  });

  test("adding a session for the same day updates the existing session", async () => {
    const lickId = await createLick(db, "Pat", "Alt phrase", 160);
    const firstId = await addSession(db, lickId, "2026-02-11", 140);
    const secondId = await addSession(db, lickId, "2026-02-11", 150);

    const sessions = await getSessions(db, lickId, "date", "desc");
    expect(secondId).toBe(firstId);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.bpm).toBe(150);
  });

  test("cannot add when best meets goal", async () => {
    const lickId = await createLick(db, "Pat", "Target hit", 150);
    await addSession(db, lickId, "2026-02-09", 150);

    const rows = await getLicks(db, null, "artist", "asc", "2026-02-11");
    expect(rows[0].can_add_today).toBe(false);
  });

  test("session bpm range uses previous best plus one as minimum and goal as maximum", () => {
    expect(getSessionBpmRange(1, 200)).toEqual({ min: 2, max: 200 });
    expect(getSessionBpmRange(150, 200)).toEqual({ min: 151, max: 200 });
    expect(getSessionBpmRange(152, 200)).toEqual({ min: 153, max: 200 });
    expect(getSessionBpmRange(200, 200)).toEqual({ min: 200, max: 200 });
  });

  test("session bpm range handles missing best bpm", () => {
    expect(getSessionBpmRange(null, 180)).toEqual({ min: 1, max: 180 });
  });

  test("missing best bpm fallback defaults to half goal rounded up to 10", () => {
    const fallback180 = Math.ceil((180 / 2) / 10) * 10;
    const fallback185 = Math.ceil((185 / 2) / 10) * 10;

    expect(fallback180).toBe(90);
    expect(fallback185).toBe(100);
  });

  test("stats aggregates session counts by date", async () => {
    const lickA = await createLick(db, "Pat", "Line A", 180);
    const lickB = await createLick(db, "Pat", "Line B", 180);
    await addSession(db, lickA, "2026-02-10", 120);
    await addSession(db, lickB, "2026-02-10", 130);
    await addSession(db, lickA, "2026-02-11", 135);

    expect(await getStats(db)).toEqual([
      { date: "2026-02-10", session_count: 2 },
      { date: "2026-02-11", session_count: 1 },
    ]);
  });

  test("stats bars classify sessions and compute progress deltas by day", async () => {
    const lickA = await createLick(db, "Pat", "Line A", 100);
    const lickB = await createLick(db, "Pat", "Line B", 200);
    const lickC = await createLick(db, "Pat", "Line C", 100);

    await addSession(db, lickA, "2026-02-10", 40);   // first, +10
    await addSession(db, lickA, "2026-02-11", 70);   // progression, +30
    await addSession(db, lickA, "2026-02-12", 105);  // completion, +35
    await addSession(db, lickA, "2026-02-13", 100);  // progression, -5

    await addSession(db, lickB, "2026-02-11", 120);  // first, +10
    await addSession(db, lickB, "2026-02-12", 150);  // progression, +15
    await addSession(db, lickC, "2026-02-12", 110);  // first+completion, +10

    expect(await getStatsBars(db)).toEqual({
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
      bpm_deltas: [
        { date: "2026-02-10", first_sessions: 1, delta_bins: [] },
        { date: "2026-02-11", first_sessions: 1, delta_bins: [{ delta_bin: 30, session_count: 1 }] },
        { date: "2026-02-12", first_sessions: 1, delta_bins: [{ delta_bin: 30, session_count: 1 }, { delta_bin: 35, session_count: 1 }] },
        { date: "2026-02-13", first_sessions: 0, delta_bins: [{ delta_bin: 5, session_count: 1 }] },
      ],
    });
  });

  test("best % distribution returns 0..100 bins in steps of 10", async () => {
    await createLick(db, "Pat", "A", 100); // no sessions -> 0
    const b = await createLick(db, "Pat", "B", 100); // 23 -> 20
    const c = await createLick(db, "Pat", "C", 100); // 68 -> 60
    const d = await createLick(db, "Pat", "D", 100); // 100 -> 100

    await addSession(db, b, "2026-02-10", 23);
    await addSession(db, c, "2026-02-10", 68);
    await addSession(db, d, "2026-02-10", 100);

    const expected = [];
    for (let bucket = 0; bucket <= 100; bucket += 10) {
      const lick_count = bucket === 0 || bucket === 20 || bucket === 60 || bucket === 100 ? 1 : 0;
      expected.push({ bucket_pct: bucket, lick_count });
    }
    expect(await getProgressDistribution(db)).toEqual(expected);
  });

  test("stats histograms return deltas and complete-only completion metrics", async () => {
    const lickA = await createLick(db, "Pat", "Line A", 100);
    const lickB = await createLick(db, "Pat", "Line B", 200);
    const lickC = await createLick(db, "Pat", "Line C", 100);

    await addSession(db, lickA, "2026-02-10", 40);
    await addSession(db, lickA, "2026-02-11", 70);   // +30
    await addSession(db, lickA, "2026-02-12", 105);  // +35 (complete on session 3, day 3)
    await addSession(db, lickA, "2026-02-13", 100);  // +5

    await addSession(db, lickB, "2026-02-11", 120);
    await addSession(db, lickB, "2026-02-12", 150);  // +30, incomplete lick

    await addSession(db, lickC, "2026-02-12", 110);  // complete on first session, day 1

    expect(await getStatsHistograms(db)).toEqual({
      session_deltas: [
        { bucket: 5, count: 1 },
        { bucket: 30, count: 2 },
        { bucket: 35, count: 1 },
      ],
      sessions_to_complete: [
        { bucket: 1, count: 1 },
        { bucket: 3, count: 1 },
      ],
      days_to_complete: [
        { bucket: 1, count: 1 },
        { bucket: 3, count: 1 },
      ],
    });
  });
});
