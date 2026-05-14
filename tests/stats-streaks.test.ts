import { describe, expect, test } from "bun:test";
import { calculateStreaks } from "../src/static/stats-streaks.js";

describe("stats streaks", () => {
  test("shows streak through yesterday when there is no session today", () => {
    const rows = [
      { date: "2026-05-11", session_count: 1 },
      { date: "2026-05-12", session_count: 2 },
      { date: "2026-05-13", session_count: 1 },
    ];

    expect(calculateStreaks(rows, new Date(2026, 4, 14))).toEqual({
      current: 3,
      longest: 3,
    });
  });

  test("counts through today when today has a session", () => {
    const rows = [
      { date: "2026-05-12", session_count: 1 },
      { date: "2026-05-13", session_count: 1 },
      { date: "2026-05-14", session_count: 1 },
    ];

    expect(calculateStreaks(rows, new Date(2026, 4, 14))).toEqual({
      current: 3,
      longest: 3,
    });
  });

  test("shows zero when neither today nor yesterday has a session", () => {
    const rows = [
      { date: "2026-05-10", session_count: 1 },
      { date: "2026-05-11", session_count: 1 },
    ];

    expect(calculateStreaks(rows, new Date(2026, 4, 14))).toEqual({
      current: 0,
      longest: 2,
    });
  });
});
