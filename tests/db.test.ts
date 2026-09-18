import { beforeEach, describe, expect, test, afterAll } from "bun:test";
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
  getTodayLicks,
  selectTodayLicks,
  getSessionBpmRange,
  hasSessionForDate,
  initSchema,
  openDb,
  updateArtist,
  updateLick,
  type Sql,
} from "../src/db";

function aggregate(id: number, overrides: Partial<Parameters<typeof selectTodayLicks>[0][number]> = {}) {
  return {
    id,
    artist_id: 1,
    artist_name: "Artist",
    lick_name: `Lick ${id}`,
    lick_url: null,
    goal_bpm: 100,
    best_bpm: 50,
    pct_of_goal: 50,
    first_date: "2026-01-01",
    last_date: `2026-02-${String(id).padStart(2, "0")}`,
    session_count: 2,
    can_add_today: true,
    ...overrides,
  };
}

let db: Sql;

beforeEach(async () => {
  if (db) await db.end();
  db = openDb(process.env.TEST_DATABASE_URL || ":memory:");
  if (db.dialect === "postgres") {
    await db.exec("DROP TABLE IF EXISTS sessions, licks, artists CASCADE");
  }
  await initSchema(db);
});

afterAll(async () => {
  if (db) {
    await db.end();
  }
});

describe("db behavior", () => {
  test("first and last date sorts keep licks without sessions last in both directions", async () => {
    const unstarted = await createLick(db, "Pat", "Unstarted", 100);
    const wide = await createLick(db, "Pat", "Wide", 100);
    const middle = await createLick(db, "Pat", "Middle", 100);
    const anotherUnstarted = await createLick(db, "Pat", "Also unstarted", 100);
    await addSession(db, wide, "2026-02-01", 50);
    await addSession(db, wide, "2026-02-20", 60);
    await addSession(db, middle, "2026-02-10", 50);

    for (const [sortBy, sortDir, dated] of [
      ["first", "asc", [wide, middle]],
      ["first", "desc", [middle, wide]],
      ["last", "asc", [middle, wide]],
      ["last", "desc", [wide, middle]],
    ] as const) {
      const rows = await getLicks(db, null, sortBy, sortDir, "2026-02-21");
      expect(rows.map((row) => row.id)).toEqual([...dated, unstarted, anotherUnstarted]);
    }
  });

  test("today selects ten unique in-progress licks for each category", () => {
    const rows = Array.from({ length: 50 }, (_, index) => {
      const id = index + 1;
      return aggregate(id, {
        pct_of_goal: id,
        session_count: id >= 21 && id <= 40 ? 1 : 2,
      });
    });

    const categories = selectTodayLicks(rows, () => 0);
    const selected = categories.flatMap((category) => category.licks);

    expect(categories.map((category) => [category.key, category.licks.length])).toEqual([
      ["most-recent", 10],
      ["least-recent", 10],
      ["lowest-best", 10],
      ["one-session", 10],
    ]);
    expect(categories[0].licks.map((row) => row.id)).toEqual([50, 49, 48, 47, 46, 45, 44, 43, 42, 41]);
    expect(categories[1].licks.map((row) => row.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(categories[2].licks.map((row) => row.id)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(new Set(selected.map((row) => row.id)).size).toBe(40);
  });

  test("today fills to forty with random in-progress licks then unstarted licks", () => {
    const inProgress = Array.from({ length: 35 }, (_, index) => aggregate(index + 1));
    const unstarted = Array.from({ length: 20 }, (_, index) => aggregate(index + 101, {
      best_bpm: null,
      pct_of_goal: null,
      first_date: null,
      last_date: null,
      session_count: 0,
    }));
    const done = aggregate(999, { best_bpm: 100, pct_of_goal: 100 });

    const categories = selectTodayLicks([...inProgress, ...unstarted, done], () => 0);
    const selected = categories.flatMap((category) => category.licks);
    const more = categories.find((category) => category.key === "more");

    expect(selected).toHaveLength(40);
    expect(new Set(selected.map((row) => row.id)).size).toBe(40);
    expect(selected.some((row) => row.id === done.id)).toBe(false);
    expect(more?.licks.filter((row) => row.session_count > 0)).toHaveLength(5);
    expect(more?.licks.filter((row) => row.session_count === 0)).toHaveLength(5);
  });

  test("today returns the populated list sorted by artist then lick", async () => {
    await createLick(db, "Pat", "Zulu", 100);
    await createLick(db, "Alex", "Beta", 100);
    await createLick(db, "Pat", "Alpha", 100);

    const rows = await getTodayLicks(db, "2026-02-11");

    expect(rows.map((row) => [row.artist_name, row.lick_name])).toEqual([
      ["Alex", "Beta"],
      ["Pat", "Alpha"],
      ["Pat", "Zulu"],
    ]);
  });

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

  test("licks default to artist name then lick name ascending", async () => {
    await createLick(db, "Pat", "Zulu", 120);
    await createLick(db, "Alex", "Beta", 120);
    await createLick(db, "Pat", "Alpha", 120);
    await createLick(db, "Alex", "Alpha", 120);

    const rows = await getLicks(db, null, "", "", "2026-02-11");

    expect(rows.map((row) => [row.artist_name, row.lick_name])).toEqual([
      ["Alex", "Alpha"],
      ["Alex", "Beta"],
      ["Pat", "Alpha"],
      ["Pat", "Zulu"],
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
